import AVFoundation
import CoreML

/// Result of screening one or more spoken answers.
struct ParkinsonVoiceAssessment {
    /// Mean model probability across analyzed 4-second windows (0–1).
    let probability: Float
    /// Probability at or above which the voice is flagged (chosen by cross-validation).
    let threshold: Float
    let windowProbabilities: [Float]
    let analyzedSeconds: Double

    var isFlagged: Bool { probability >= threshold }
}

enum ParkinsonVoiceScreenerError: Error {
    case modelNotFound
    case notEnoughAudio
    case conversionFailed
}

/// Runs `ParkinsonVoiceClassifier.mlmodel` over a recording.
///
/// The model takes exactly 4 s of 16 kHz mono Float32 audio and computes its own
/// log-mel features. Window selection below must stay in sync with
/// `backend/parkinsons/data.py` (`voiced_mask` / `valid_window_starts`).
final class ParkinsonVoiceScreener {
    static let sampleRate: Double = 16_000
    static let windowSamples = 64_000
    static let hopSamples = 32_000
    static let minimumSamples = 16_000

    private static let vadFrame = 400
    private static let vadHop = 160
    private static let vadDbBelowMax: Float = 35
    private static let vadMinVoicedFraction: Float = 0.6

    static var cpuConfiguration: MLModelConfiguration {
        let configuration = MLModelConfiguration()
        configuration.computeUnits = .cpuOnly
        return configuration
    }

    let threshold: Float
    private let model: MLModel

    /// Defaults to CPU: the in-model spectrogram squares FFT magnitudes, which can overflow fp16 on GPU/Neural Engine.
    init(configuration: MLModelConfiguration = ParkinsonVoiceScreener.cpuConfiguration) throws {
        guard let url = Bundle.main.url(forResource: "ParkinsonVoiceClassifier", withExtension: "mlmodelc") else {
            throw ParkinsonVoiceScreenerError.modelNotFound
        }
        model = try MLModel(contentsOf: url, configuration: configuration)
        let metadata = model.modelDescription.metadata[.creatorDefinedKey] as? [String: String]
        threshold = metadata?["decision_threshold"].flatMap(Float.init) ?? 0.5
    }

    /// Screens an audio file in any format AVFoundation can read.
    func analyze(fileURL: URL) throws -> ParkinsonVoiceAssessment {
        try analyze(samples: Self.loadMono16k(fileURL: fileURL))
    }

    /// Screens 16 kHz mono samples (e.g. from `VoiceSampleRecorder`).
    func analyze(samples raw: [Float]) throws -> ParkinsonVoiceAssessment {
        guard raw.count >= Self.minimumSamples else { throw ParkinsonVoiceScreenerError.notEnoughAudio }

        let mean = raw.reduce(0, +) / Float(raw.count)
        var samples = raw.map { $0 - mean }
        let starts = Self.validWindowStarts(samples)
        if samples.count < Self.windowSamples {
            let original = samples
            while samples.count < Self.windowSamples { samples += original }
        }

        var probabilities: [Float] = []
        for start in starts {
            let input = try MLMultiArray(shape: [1, NSNumber(value: Self.windowSamples)], dataType: .float32)
            let pointer = input.dataPointer.bindMemory(to: Float.self, capacity: Self.windowSamples)
            samples.withUnsafeBufferPointer { buffer in
                pointer.update(from: buffer.baseAddress! + start, count: Self.windowSamples)
            }
            let output = try model.prediction(from: MLDictionaryFeatureProvider(dictionary: ["audio": input]))
            if let value = output.featureValue(for: "parkinsons_probability")?.multiArrayValue {
                probabilities.append(value[0].floatValue)
            }
        }
        guard !probabilities.isEmpty else { throw ParkinsonVoiceScreenerError.notEnoughAudio }

        return ParkinsonVoiceAssessment(
            probability: probabilities.reduce(0, +) / Float(probabilities.count),
            threshold: threshold,
            windowProbabilities: probabilities,
            analyzedSeconds: Double(raw.count) / Self.sampleRate
        )
    }

    /// Combines several answers (e.g. the three check-in turns) by averaging per-answer probabilities.
    func analyze(answers: [[Float]]) throws -> ParkinsonVoiceAssessment {
        let results = answers.compactMap { try? analyze(samples: $0) }
        guard !results.isEmpty else { throw ParkinsonVoiceScreenerError.notEnoughAudio }
        return ParkinsonVoiceAssessment(
            probability: results.map(\.probability).reduce(0, +) / Float(results.count),
            threshold: threshold,
            windowProbabilities: results.flatMap(\.windowProbabilities),
            analyzedSeconds: results.map(\.analyzedSeconds).reduce(0, +)
        )
    }

    // MARK: - Voice-activity window selection

    private static func validWindowStarts(_ audio: [Float]) -> [Int] {
        guard audio.count > windowSamples else { return [0] }

        var squares = [Double](repeating: 0, count: audio.count + 1)
        for i in 0..<audio.count {
            squares[i + 1] = squares[i] + Double(audio[i]) * Double(audio[i])
        }
        let frameCount = (audio.count - vadFrame) / vadHop + 1
        var db = [Float](repeating: 0, count: frameCount)
        for f in 0..<frameCount {
            let s = f * vadHop
            let energy = (squares[s + vadFrame] - squares[s]) / Double(vadFrame)
            db[f] = Float(10 * log10(energy + 1e-10))
        }
        let cutoff = (db.max() ?? 0) - vadDbBelowMax
        var voicedSum = [Float](repeating: 0, count: frameCount + 1)
        for f in 0..<frameCount {
            voicedSum[f + 1] = voicedSum[f] + (db[f] > cutoff ? 1 : 0)
        }

        let framesPerWindow = (windowSamples - vadFrame) / vadHop + 1
        var kept: [Int] = []
        var best = (start: 0, fraction: Float(-1))
        for start in stride(from: 0, through: audio.count - windowSamples, by: hopSamples) {
            let first = start / vadHop
            let last = min(first + framesPerWindow, frameCount)
            let fraction = (voicedSum[last] - voicedSum[first]) / Float(framesPerWindow)
            if fraction >= vadMinVoicedFraction { kept.append(start) }
            if fraction > best.fraction { best = (start, fraction) }
        }
        return kept.isEmpty ? [best.start] : kept
    }

    // MARK: - Audio loading

    static var targetFormat: AVAudioFormat {
        AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: sampleRate, channels: 1, interleaved: false)!
    }

    static func loadMono16k(fileURL: URL) throws -> [Float] {
        let file = try AVAudioFile(forReading: fileURL)
        guard let source = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)) else {
            throw ParkinsonVoiceScreenerError.conversionFailed
        }
        try file.read(into: source)
        return try convert(source, endOfStream: true)
    }

    static func convert(_ buffer: AVAudioPCMBuffer, using existing: AVAudioConverter? = nil, endOfStream: Bool = false) throws -> [Float] {
        guard let converter = existing ?? AVAudioConverter(from: buffer.format, to: targetFormat) else {
            throw ParkinsonVoiceScreenerError.conversionFailed
        }
        let ratio = sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 1024
        guard let output = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: capacity) else {
            throw ParkinsonVoiceScreenerError.conversionFailed
        }
        var delivered = false
        var error: NSError?
        converter.convert(to: output, error: &error) { _, status in
            if delivered {
                status.pointee = endOfStream ? .endOfStream : .noDataNow
                return nil
            }
            delivered = true
            status.pointee = .haveData
            return buffer
        }
        if let error { throw error }
        guard let channel = output.floatChannelData?[0] else { throw ParkinsonVoiceScreenerError.conversionFailed }
        return Array(UnsafeBufferPointer(start: channel, count: Int(output.frameLength)))
    }
}

/// Captures microphone audio as 16 kHz mono Float32, ready for `ParkinsonVoiceScreener`.
final class VoiceSampleRecorder {
    private let engine = AVAudioEngine()
    private let queue = DispatchQueue(label: "VoiceSampleRecorder")
    private var converter: AVAudioConverter?
    private var samples: [Float] = []

    func start() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .allowBluetooth])
        try session.setActive(true)

        queue.sync { samples.removeAll() }
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        converter = AVAudioConverter(from: format, to: ParkinsonVoiceScreener.targetFormat)

        input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, _ in
            guard let self, let converted = try? ParkinsonVoiceScreener.convert(buffer, using: self.converter) else { return }
            self.queue.async { self.samples.append(contentsOf: converted) }
        }
        engine.prepare()
        try engine.start()
    }

    /// Stops recording and returns everything captured since `start()`.
    func stop() -> [Float] {
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        return queue.sync { samples }
    }
}
