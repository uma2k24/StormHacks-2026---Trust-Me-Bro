import SwiftUI

/// The numbers behind the vitals, for anyone who taps one: each measure on its own scale with the
/// healthy and Parkinson's ranges, and what the classifier made of the whole check-in. It is kept off
/// the main pages on purpose: most people don't need it, and it is technical.
/// Mirrors VitalDetail.tsx on the web.
struct VitalDetailView: View {
    let results: ScreeningResults
    /// The vital that was tapped: it comes first.
    let focus: MeasureKey

    private var order: [MeasureKey] { [focus] + MeasureKey.allCases.filter { $0 != focus } }

    var body: some View {
        VStack(spacing: 26) {
            RetroWindow(title: "Voice quality") {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Measured on your “ahhh”. Higher jitter and shimmer are worse. Lower HNR is worse.")
                        .font(AppFont.body(18))
                        .foregroundStyle(AppTheme.inkSoft)
                        .fixedSize(horizontal: false, vertical: true)

                    if let verdict = VoiceReading.verdict(metrics: results.metrics) {
                        VStack(alignment: .leading, spacing: 8) {
                            StatusChip(status: verdict.zone.statusColor, label: verdict.zone.label)
                            Text(verdict.line)
                                .font(AppFont.body(19))
                                .foregroundStyle(AppTheme.ink)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }

                    ForEach(order, id: \.self) { key in
                        if let metric = results.metrics.first(where: { $0.key == key }) {
                            MeasureCard(measure: VoiceReading.measure(key), reading: metric.reading)
                        }
                    }
                }
            }

            if let detail = results.detail {
                RetroWindow(title: "Overall result", index: 1) {
                    ResultPanel(detail: detail)
                }
            }
        }
    }
}

private struct MeasureCard: View {
    let measure: Measure
    let reading: Reading?

    @ScaledMetric(relativeTo: .largeTitle) private var valueSize: CGFloat = 40

    var body: some View {
        let card = RoundedRectangle(cornerRadius: 16, style: .continuous)

        VStack(alignment: .leading, spacing: 0) {
            Text(measure.label)
                .font(AppFont.body(19, bold: true))
                .foregroundStyle(AppTheme.inkSoft)

            if let reading {
                Text(VoiceReading.format(measure, reading.value))
                    .font(AppFont.head(valueSize, relativeTo: .largeTitle))
                    .foregroundStyle(AppTheme.ink)
                    .monospacedDigit()
                    .padding(.top, 4)

                StatusChip(status: reading.zone.statusColor, label: reading.zone.label)
                    .padding(.top, 8)

                ZoneBar(measure: measure, value: reading.value)
                    .padding(.top, 12)
            } else {
                Text("Couldn’t be measured this time.")
                    .font(AppFont.body(19))
                    .foregroundStyle(AppTheme.ink)
                    .padding(.top, 8)
            }

            Text("Healthy \(measure.healthyRange)")
                .font(AppFont.body(17))
                .foregroundStyle(AppTheme.inkSoft)
                .padding(.top, 12)
            Text("Parkinson’s \(measure.parkinsonRange)")
                .font(AppFont.body(17))
                .foregroundStyle(AppTheme.inkSoft)
                .padding(.top, 4)
            Text(measure.explanation)
                .font(AppFont.body(17))
                .foregroundStyle(AppTheme.ink)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 12)
        }
        .padding(.horizontal, 18)
        .padding(.top, 14)
        .padding(.bottom, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(card.fill(AppTheme.paper))
        .overlay { card.stroke(AppTheme.ink, lineWidth: 2.5) }
        .accessibilityElement(children: .combine)
    }
}

/// Healthy | in between | Parkinson's range, with a marker where the reading is.
private struct ZoneBar: View {
    let measure: Measure
    let value: Double

    var body: some View {
        let borderline = VoiceReading.position(of: measure, value: measure.borderlineAt)
        let elevated = VoiceReading.position(of: measure, value: measure.elevatedAt)
        let marker = VoiceReading.position(of: measure, value: value)
        let ends = VoiceReading.scaleLabels(measure)

        VStack(spacing: 4) {
            GeometryReader { proxy in
                let width = proxy.size.width
                ZStack(alignment: .leading) {
                    HStack(spacing: 0) {
                        AppTheme.zoneReady.frame(width: width * borderline)
                        AppTheme.zoneAttention.frame(width: width * (elevated - borderline))
                        AppTheme.zoneRest.frame(width: width * (1 - elevated))
                    }
                    .frame(height: 18)
                    .clipShape(Capsule())
                    .overlay { Capsule().stroke(AppTheme.ink, lineWidth: 2.5) }

                    Marker()
                        .offset(x: min(max(width * marker - 3.5, 0), width - 7))
                }
            }
            .frame(height: 30)

            HStack {
                Text(ends.from)
                Spacer()
                Text(ends.to)
            }
            .font(AppFont.body(16))
            .foregroundStyle(AppTheme.inkSoft)
        }
        .accessibilityHidden(true)
    }
}

/// The little upright bar that shows where a value is.
private struct Marker: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 3, style: .continuous)
            .fill(AppTheme.ink)
            .frame(width: 7, height: 30)
            .overlay { RoundedRectangle(cornerRadius: 3, style: .continuous).stroke(Color.white, lineWidth: 2) }
    }
}

private struct ResultPanel: View {
    let detail: ResultDetail

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 8) {
                if !detail.flagged {
                    Image(systemName: "checkmark.circle")
                        .font(.system(size: 26, weight: .bold))
                        .accessibilityHidden(true)
                }
                Text(detail.flagged
                    ? "Flagged: speech patterns resemble the Parkinson’s group"
                    : "Not flagged: speech patterns resemble the control group")
                    .font(AppFont.head(23, relativeTo: .title3))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .foregroundStyle(AppTheme.ink)

            GeometryReader { proxy in
                let width = proxy.size.width
                ZStack(alignment: .leading) {
                    ZStack(alignment: .leading) {
                        Rectangle().fill(AppTheme.paperDeep)
                        Rectangle()
                            .fill(LinearGradient(colors: [AppTheme.zoneReady, AppTheme.zoneRest], startPoint: .leading, endPoint: .trailing))
                            .frame(width: max(width * detail.probability, 0))
                    }
                    .frame(height: 20)
                    .clipShape(Capsule())
                    .overlay { Capsule().stroke(AppTheme.ink, lineWidth: 2.5) }

                    Marker()
                        .offset(x: min(max(width * detail.threshold - 3.5, 0), width - 7))
                }
            }
            .frame(height: 30)
            .padding(.top, 4)
            .accessibilityHidden(true)

            Text("Probability \(String(format: "%.3f", detail.probability)) against a decision threshold of \(String(format: "%.3f", detail.threshold)).")
                .font(AppFont.body(19))
                .foregroundStyle(AppTheme.ink)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 4) {
                ForEach(detail.tasks.indices, id: \.self) { index in
                    let task = detail.tasks[index]
                    Text("\(task.label): \(String(format: "%.3f", task.probability)) (weight \(Int((task.weight * 100).rounded()))%)")
                        .font(AppFont.body(17))
                        .foregroundStyle(AppTheme.inkSoft)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Text("This is a screening aid, not a diagnosis. If you are worried, talk with your doctor.")
                .font(AppFont.body(17))
                .foregroundStyle(AppTheme.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 4)
        }
        .accessibilityElement(children: .combine)
    }
}
