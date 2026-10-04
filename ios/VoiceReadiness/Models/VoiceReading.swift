import Foundation

/// What the voice analysis means, all worked out on the device (nothing here calls Gemini): where
/// each of the three measures falls, the readiness score, the plain-words summary and the
/// ScreeningResults the dashboard shows. The numbers themselves come from the web backend's
/// POST /api/voice/analyze (see VoiceAnalysis.swift).
///
/// Kept gentle: the overview shows readiness plus a short, non-diagnostic Parkinson’s indication.
/// The numeric ranges appear when someone opens a vital to see the details.
/// Mirrors frontend/src/data/voiceReading.ts.
struct Measure {
    let key: MeasureKey
    let label: String
    /// In plain words, for the vitals list.
    let description: String
    let systemImage: String
    /// The status chip for each zone, in plain words.
    let healthy: String
    let borderline: String
    let elevated: String
    let decimals: Int
    let unit: String
    /// What the bar runs from (left) and to (right). HNR runs the other way: lower is worse.
    let scaleFrom: Double
    let scaleTo: Double
    /// Past `borderlineAt` the reading is no longer healthy, and past `elevatedAt` it is in the Parkinson's range.
    let borderlineAt: Double
    let elevatedAt: Double
    /// Middle of the healthy range, to say how far from it a reading is.
    let healthyMid: Double
    let healthyRange: String
    let parkinsonRange: String
    /// For the details: what it is, and which way is better.
    let explanation: String

    func status(for zone: Zone) -> String {
        switch zone {
        case .healthy: return healthy
        case .borderline: return borderline
        case .elevated: return elevated
        }
    }
}

enum VoiceReading {
    static let measures: [MeasureKey: Measure] = [
        .jitter: Measure(
            key: .jitter,
            label: "Jitter",
            description: "How much the pitch wobbles",
            systemImage: "waveform.path.ecg",
            healthy: "Steady",
            borderline: "A bit higher",
            elevated: "Higher than usual",
            decimals: 2,
            unit: "%",
            scaleFrom: 0.2,
            scaleTo: 2.5,
            borderlineAt: 0.62,
            elevatedAt: 1.12,
            healthyMid: 0.55,
            healthyRange: "0.4–0.7%",
            parkinsonRange: "0.8–1.5%+",
            explanation: "Pitch wobble from one vocal-fold cycle to the next. Higher is less steady."
        ),
        .shimmer: Measure(
            key: .shimmer,
            label: "Shimmer",
            description: "How much the volume shakes",
            systemImage: "waveform",
            healthy: "Steady",
            borderline: "A bit uneven",
            elevated: "More uneven",
            decimals: 2,
            unit: "%",
            scaleFrom: 2,
            scaleTo: 15,
            borderlineAt: 6.7,
            elevatedAt: 8.5,
            healthyMid: 6,
            healthyRange: "5–7%",
            parkinsonRange: "8–12%+",
            explanation: "Loudness wobble from one vocal-fold cycle to the next. Higher is less even."
        ),
        .hnr: Measure(
            key: .hnr,
            label: "HNR",
            description: "How clear vs. breathy the voice is",
            systemImage: "wind",
            healthy: "Clear",
            borderline: "Slightly lower",
            elevated: "Breathier",
            decimals: 1,
            unit: " dB",
            scaleFrom: 30,
            scaleTo: 5,
            borderlineAt: 14.9,
            elevatedAt: 12.8,
            healthyMid: 18,
            healthyRange: "15–21 dB",
            parkinsonRange: "11–14 dB",
            explanation: "Clear tone versus breathy noise. Lower means more noise."
        )
    ]

    static func measure(_ key: MeasureKey) -> Measure { measures[key]! }

    static func zone(of measure: Measure, value: Double) -> Zone {
        // HNR is the other way round: a lower number is the worse one
        let lowerIsWorse = measure.scaleTo < measure.scaleFrom
        let past = { (limit: Double) in lowerIsWorse ? value <= limit : value >= limit }
        return past(measure.elevatedAt) ? .elevated : past(measure.borderlineAt) ? .borderline : .healthy
    }

    /// Where a value sits along the bar, 0 (left end) ... 1 (right end).
    static func position(of measure: Measure, value: Double) -> Double {
        min(1, max(0, (value - measure.scaleFrom) / (measure.scaleTo - measure.scaleFrom)))
    }

    /// "0.51%", "14.1 dB"
    static func format(_ measure: Measure, _ value: Double) -> String {
        String(format: "%.\(measure.decimals)f", value) + measure.unit
    }

    /// The two ends of the bar: "0.20%" and "2.50%+" (the plus where the scale runs on past the end,
    /// which is where higher is worse).
    static func scaleLabels(_ measure: Measure) -> (from: String, to: String) {
        let runsOn = measure.scaleTo > measure.scaleFrom
        return (format(measure, measure.scaleFrom), format(measure, measure.scaleTo) + (runsOn ? "+" : ""))
    }

    // MARK: The score

    /// Readiness, 0...100, from the classifier's number. It is anchored on the decision threshold, so
    /// "flagged" always lands in Rest Recommended: a number half-way to the threshold is the edge of
    /// Ready (80), the threshold itself is the edge of Pay Attention (60), and 1.0 is 20.
    static func readiness(probability: Double, threshold: Double) -> Int {
        let p = min(1, max(0, probability))
        let half = threshold / 2
        let score: Double
        if p <= half {
            score = 100 - 20 * p / half
        } else if p <= threshold {
            score = 80 - 20 * (p - half) / (threshold - half)
        } else {
            score = 60 - 40 * (p - threshold) / (1 - threshold)
        }
        return Int(score.rounded())
    }

    // MARK: Words

    private static func trouble(_ key: MeasureKey) -> String {
        switch key {
        case .jitter: return "your pitch wobbled a little more than usual"
        case .shimmer: return "your volume was a little uneven"
        case .hnr: return "your voice sounded a bit breathier"
        }
    }

    private static func joined(_ parts: [String]) -> String {
        switch parts.count {
        case 0: return ""
        case 1: return parts[0]
        default: return parts.dropLast().joined(separator: ", ") + " and " + parts[parts.count - 1]
        }
    }

    /// The plain-words summary. Never diagnostic: how the voice sounded, and a gentle suggestion.
    static func summary(score: Int, metrics: [Metric]) -> String {
        let off = metrics.filter(\.isWarning).map { trouble($0.key) }
        let trouble = joined(off)
        let lead = trouble.isEmpty ? "" : "Today \(trouble)."

        if score >= 80 {
            return trouble.isEmpty
                ? "Your voice sounded clear and steady today. Nothing stood out, so enjoy your day."
                : "Your voice sounded mostly clear and steady today. \(lead) Nothing to worry about."
        }
        if score >= 60 {
            let start = trouble.isEmpty ? "Your voice sounded a little different from usual today. " : "\(lead) "
            return "\(start)Rest, a warm drink and a glass of water may help."
        }
        let start = trouble.isEmpty ? "" : "\(lead) "
        return "\(start)Your voice sounded quite different from usual today. A quiet morning is a good idea, and if it keeps up, mention it to someone you trust or your doctor."
    }

    /// Short Parkinson’s line for the overview, next to the score. Never a diagnosis — just how
    /// today’s voice patterns compare. Mirrors parkinsonsIndication() in voiceReading.ts.
    static func parkinsonsIndication(score: Int) -> String {
        if score >= 80 {
            return "You most likely don’t have Parkinson’s — today’s voice patterns look typical."
        }
        if score >= 60 {
            return "Parkinson’s is still unlikely from this check-in, though a few patterns were a little off."
        }
        return "Today’s patterns looked closer to the Parkinson’s group. This isn’t a diagnosis — mention it to someone you trust or your doctor if it keeps up."
    }

    /// "Borderline", and why, for the top of the details. Nil when nothing was measured.
    static func verdict(metrics: [Metric]) -> (zone: Zone, line: String)? {
        let readings = metrics.compactMap(\.reading)
        guard !readings.isEmpty else { return nil }

        let total = readings.count
        func count(_ zone: Zone) -> Int { readings.filter { $0.zone == zone }.count }
        if count(.elevated) > 0 {
            return (.elevated, "\(count(.elevated)) of \(total) measures sit in the Parkinson’s range.")
        }
        if count(.borderline) > 0 {
            return (.borderline, "\(count(.borderline)) of \(total) measures sit between the healthy and Parkinson’s ranges.")
        }
        return (.healthy, "All \(total) measures are in the healthy range.")
    }

    // MARK: The dashboard

    private static func metric(_ measure: Measure, value: Double?) -> Metric {
        guard let value else {
            return Metric(
                key: measure.key,
                label: measure.label,
                description: measure.description,
                status: "Couldn’t measure",
                deviation: 0,
                isWarning: false,
                systemImage: measure.systemImage,
                reading: nil
            )
        }
        let zone = zone(of: measure, value: value)
        return Metric(
            key: measure.key,
            label: measure.label,
            description: measure.description,
            status: measure.status(for: zone),
            deviation: Int(((value - measure.healthyMid) / measure.healthyMid * 100).rounded()),
            isWarning: zone != .healthy,
            systemImage: measure.systemImage,
            reading: Reading(value: value, zone: zone)
        )
    }

    /// The dashboard for one measured check-in. `earlier` are the days before today that were measured
    /// (oldest first); `yesterday` is yesterday's score, when there is one.
    static func results(
        user: String,
        analysis: VoiceAnalysis,
        earlier: [TrendPoint],
        yesterday: Int?
    ) -> ScreeningResults {
        let score = readiness(probability: analysis.probability, threshold: analysis.threshold)
        let metrics = [
            metric(measure(.jitter), value: analysis.measures?.jitter),
            metric(measure(.shimmer), value: analysis.measures?.shimmer),
            metric(measure(.hnr), value: analysis.measures?.hnr)
        ]
        let labels = ["vowel": "Sustained vowel", "speech": "Conversation"]
        let status = StatusColor(score: score)

        return ScreeningResults(
            source: .measured,
            user: user,
            readinessScore: score,
            statusColor: status,
            aiSummary: summary(score: score, metrics: metrics),
            metrics: metrics,
            detail: ResultDetail(
                probability: analysis.probability,
                threshold: analysis.threshold,
                tasks: analysis.tasks.map {
                    ResultDetail.Task(label: labels[$0.id] ?? $0.id, probability: $0.probability, weight: $0.weight)
                }
            ),
            trendData: earlier + [TrendPoint(day: "Today", score: score)],
            yesterdayScore: yesterday ?? score,
            yesterdayLabel: StatusColor(score: yesterday ?? score).label
        )
    }
}
