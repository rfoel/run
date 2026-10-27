import Charts
import MapKit
import SwiftUI

struct ActivityDetailView: View {
    let activity: Activity
    @State private var detail: ActivityDetail?
    @State private var error: Error?

    private var a: Activity { detail?.activity ?? activity }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                header
                metrics
                if let series = detail?.series, series.km.count > 1 {
                    PaceChart(series: series)
                }
                if let splits = a.splits, !splits.isEmpty {
                    SplitsCard(splits: splits)
                }
                if let laps = detail?.extras?.laps, laps.count > 1 {
                    LapsCard(laps: laps)
                }
                if let insights = detail?.analysis?.analysis.analysis {
                    AnalysisCard(insights: insights)
                }
                if detail == nil && error == nil {
                    ProgressView().padding()
                }
                if let error {
                    ErrorState(error: error) { await load() }
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 32)
        }
        .background { AppBackground() }
        .navigationTitle(a.name)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        do {
            detail = try await API.activity(source: activity.source, externalId: activity.externalId)
            error = nil
        } catch {
            if !(error is CancellationError) { self.error = error }
        }
    }

    // Full route once the detail arrives; the list thumbnail until then.
    private var route: [CLLocationCoordinate2D] {
        if let p = detail?.activity.polyline { return decodePolyline(p) }
        return activity.thumb.map { decodePolyline($0, precision: 4) } ?? []
    }

    @ViewBuilder private var header: some View {
        let coords = route
        ZStack(alignment: .bottomLeading) {
            if coords.count > 1 {
                Map(initialPosition: .rect(boundingRect(coords)), interactionModes: []) {
                    MapPolyline(coordinates: coords)
                        .stroke(.volt, style: StrokeStyle(lineWidth: 5, lineCap: .round, lineJoin: .round))
                    Annotation("", coordinate: coords.first!) {
                        Circle().fill(.green).stroke(.white, lineWidth: 2).frame(width: 12, height: 12)
                    }
                    Annotation("", coordinate: coords.last!) {
                        Circle().fill(.red).stroke(.white, lineWidth: 2).frame(width: 12, height: 12)
                    }
                }
                .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll))
                .id(coords.count) // re-frame when the full route replaces the thumbnail
            } else {
                Rectangle().fill(.primary.opacity(0.06))
                    .overlay {
                        Image(systemName: "figure.run.treadmill").font(.system(size: 64)).foregroundStyle(.secondary)
                    }
            }

            VStack(alignment: .leading, spacing: 0) {
                Text(Fmt.km(a.distance))
                    .font(.display(64))
                    .monospacedDigit()
                Text("quilômetros · \(Fmt.runWhen(a.date))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .glassEffect(in: .rect(cornerRadius: 22))
            .padding(12)
        }
        .frame(height: 340)
        .clipShape(.rect(cornerRadius: 28))
    }

    private var metrics: some View {
        let extras = detail?.extras
        let items: [(String, String)] = [
            (Fmt.pace(a.paceSecPerKm), "pace /km"),
            (Fmt.duration(a.movingTime), "tempo"),
            (a.avgHr.map { "\(Int($0))" } ?? "--", "FC média"),
            (a.maxHr.map { "\(Int($0))" } ?? "--", "FC máx"),
            ("\(Int(a.elevationGain))", "elevação m"),
            (a.avgCadence.map { "\(Int($0 * 2))" } ?? "--", "cadência spm"),
        ] + [
            extras?.weather?.tempC.map { ("\(Int($0.rounded()))°", "temperatura") },
            extras?.physio?.aerobicTE.map { ($0.formatted(.number.precision(.fractionLength(1)).locale(Fmt.locale)), "TE aeróbico") },
            extras?.physio?.calories.map { ("\(Int($0))", "kcal") },
        ].compactMap { $0 }

        return LazyVGrid(columns: Array(repeating: GridItem(.flexible(), alignment: .leading), count: 3), spacing: 14) {
            ForEach(items, id: \.1) { Metric(value: $0.0, label: $0.1) }
        }
        .glassCard()
    }

    private func boundingRect(_ coords: [CLLocationCoordinate2D]) -> MKMapRect {
        let points = coords.map(MKMapPoint.init)
        let xs = points.map(\.x), ys = points.map(\.y)
        let rect = MKMapRect(x: xs.min()!, y: ys.min()!, width: xs.max()! - xs.min()!, height: ys.max()! - ys.min()!)
        // Room around the route, and extra at the bottom for the distance badge.
        let padX = rect.width * 0.25 + 200, padY = rect.height * 0.25 + 200
        return MKMapRect(x: rect.minX - padX, y: rect.minY - padY, width: rect.width + padX * 2, height: rect.height + padY * 3.2)
    }
}

// MARK: - Cards

private struct CardTitle: View {
    let text: String
    var body: some View {
        Text(text).font(.headline).padding(.bottom, 4)
    }
}

struct PaceChart: View {
    struct Point: Identifiable {
        let km: Double
        let pace: Double?
        let hr: Double?
        var id: Double { km }
    }

    let points: [Point]
    let paceDomain: ClosedRange<Double>
    let hrDomain: ClosedRange<Double>?

    init(series: ChartSeries) {
        // Thousands of samples; ~240 is plenty for a phone-wide chart.
        let n = series.km.count
        let step = max(1, n / 240)
        var pts: [Point] = []
        for i in stride(from: 0, to: n, by: step) {
            pts.append(Point(km: series.km[i], pace: series.pace[safe: i] ?? nil, hr: series.hr[safe: i] ?? nil))
        }
        points = pts
        // Clip the pace axis to the 5th–95th percentile so stops don't flatten the line.
        let paces = pts.compactMap(\.pace).filter { $0 > 0 }.sorted()
        if paces.count > 4 {
            paceDomain = paces[paces.count / 20]...paces[paces.count * 19 / 20]
        } else {
            paceDomain = (paces.first ?? 240)...(paces.last ?? 480)
        }
        let hrs = pts.compactMap(\.hr)
        hrDomain = hrs.isEmpty ? nil : hrs.min()!...hrs.max()!
    }

    var body: some View {
        VStack(alignment: .leading) {
            CardTitle(text: "Pace")
            Chart(points) { p in
                if let pace = p.pace {
                    LineMark(x: .value("km", p.km), y: .value("pace", min(max(pace, paceDomain.lowerBound), paceDomain.upperBound)))
                        .foregroundStyle(.tint)
                        .interpolationMethod(.monotone)
                }
            }
            .chartYScale(domain: .automatic(includesZero: false, reversed: true))
            .chartYAxis {
                AxisMarks { v in
                    AxisGridLine()
                    AxisValueLabel { if let s = v.as(Double.self) { Text(Fmt.pace(s)) } }
                }
            }
            .chartXAxisLabel("km")
            .frame(height: 160)

            if let hrDomain {
                CardTitle(text: "Frequência cardíaca").padding(.top, 8)
                Chart(points) { p in
                    if let hr = p.hr {
                        AreaMark(x: .value("km", p.km), yStart: .value("min", hrDomain.lowerBound), yEnd: .value("bpm", hr))
                            .foregroundStyle(.linearGradient(colors: [.red.opacity(0.35), .red.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                            .interpolationMethod(.monotone)
                        LineMark(x: .value("km", p.km), y: .value("bpm", hr))
                            .foregroundStyle(.red)
                            .interpolationMethod(.monotone)
                    }
                }
                .chartYScale(domain: hrDomain)
                .chartXAxisLabel("km")
                .frame(height: 120)
            }
        }
        .glassCard()
    }
}

struct SplitsCard: View {
    let splits: [Split]

    var body: some View {
        // Partial last km: pace from its own fraction.
        let paces = splits.map { $0.movingSec / max($0.km - floor($0.km - 0.0001), 0.0001) }
        let fastest = paces.min() ?? 1, slowest = paces.max() ?? 1

        VStack(alignment: .leading, spacing: 8) {
            CardTitle(text: "Parciais")
            ForEach(Array(splits.enumerated()), id: \.offset) { i, s in
                HStack(spacing: 10) {
                    Text(s.km == floor(s.km) ? "\(Int(s.km))" : String(format: "%.1f", s.km))
                        .font(.subheadline.monospacedDigit())
                        .frame(width: 30, alignment: .leading)
                        .foregroundStyle(.secondary)
                    GeometryReader { g in
                        // Faster = longer bar.
                        let t = slowest == fastest ? 1 : (slowest - paces[i]) / (slowest - fastest)
                        Capsule()
                            .fill(paces[i] == fastest ? AnyShapeStyle(.tint) : AnyShapeStyle(.primary.opacity(0.25)))
                            .frame(width: g.size.width * (0.35 + 0.65 * t))
                    }
                    .frame(height: 10)
                    Text(Fmt.pace(paces[i]))
                        .font(.subheadline.monospacedDigit().weight(.semibold))
                        .frame(width: 44, alignment: .trailing)
                    Text(s.avgHr.map { "\(Int($0))" } ?? "")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.red)
                        .frame(width: 30, alignment: .trailing)
                }
            }
        }
        .glassCard()
    }
}

struct LapsCard: View {
    let laps: [DeviceLap]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            CardTitle(text: "Voltas")
            Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 6) {
                GridRow {
                    Text("#"); Text("dist"); Text("tempo"); Text("pace"); Text("FC")
                }
                .font(.caption)
                .foregroundStyle(.secondary)
                ForEach(laps) { lap in
                    GridRow {
                        Text("\(lap.index)").foregroundStyle(.secondary)
                        Text(lap.distance >= 1000 ? "\(Fmt.km(lap.distance)) km" : "\(Int(lap.distance)) m")
                        Text(Fmt.duration(lap.duration))
                        Text(Fmt.pace(lap.paceSecPerKm)).fontWeight(.semibold)
                        Text(lap.avgHr.map { "\(Int($0))" } ?? "--").foregroundStyle(.red)
                    }
                    .font(.subheadline.monospacedDigit())
                    .opacity(lap.intensity == "recovery" || lap.intensity == "rest" ? 0.5 : 1)
                }
            }
        }
        .glassCard()
    }
}

struct AnalysisCard: View {
    let insights: WorkoutAnalysis.Insights

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                CardTitle(text: "Análise")
                Spacer()
                if let hit = insights.target_hit {
                    Label(hit ? "Alvo atingido" : "Fora do alvo", systemImage: hit ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .glassEffect(.regular.tint(hit ? .green.opacity(0.4) : .orange.opacity(0.4)))
                }
            }
            bullets(insights.highlights, icon: "sparkles", color: .green)
            bullets(insights.issues, icon: "exclamationmark.triangle", color: .orange)
            if let next = insights.next_workout_suggestion {
                Label { Text(next) } icon: { Image(systemName: "arrow.forward.circle").foregroundStyle(.tint) }
                    .font(.subheadline)
            }
        }
        .glassCard()
    }

    @ViewBuilder private func bullets(_ items: [String]?, icon: String, color: Color) -> some View {
        ForEach(items ?? [], id: \.self) { s in
            Label { Text(s) } icon: { Image(systemName: icon).foregroundStyle(color) }
                .font(.subheadline)
        }
    }
}

extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}
