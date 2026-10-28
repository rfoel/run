import SwiftUI

struct PlanView: View {
    @Environment(Store.self) private var store

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackground()
                content
            }
            .navigationTitle("Plano")
            .navigationDestination(for: PlannedRun.self) { PlannedRunDetailView(run: $0) }
            .navigationDestination(for: Activity.self) { ActivityDetailView(activity: $0) }
        }
        .task {
            if !store.loadedPlan { await store.loadPlan() }
            if !store.loadedFeed { await store.loadFeed() }
        }
    }

    @ViewBuilder private var content: some View {
        if !store.loadedPlan {
            ProgressView()
        } else if let error = store.planError, store.plans.isEmpty {
            ErrorState(error: error) { await store.loadPlan() }
        } else if store.plans.isEmpty && store.activeBlock == nil {
            ContentUnavailableView("Sem plano", systemImage: "calendar.badge.plus",
                                   description: Text("Crie um bloco de treino pelo MCP no Claude."))
        } else {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        if let block = store.activeBlock { BlockHeader(block: block) }
                        GlassEffectContainer(spacing: 14) {
                            VStack(spacing: 14) {
                                ForEach(weeks, id: \.start) { week in
                                    WeekCard(start: week.start, runs: week.runs, info: weekInfo(week.start))
                                        .id(week.start)
                                }
                            }
                        }
                    }
                    .padding(.horizontal)
                    .padding(.bottom, 24)
                }
                .refreshable { await store.loadPlan() }
                .onAppear {
                    let thisWeek = Fmt.calendar.dateInterval(of: .weekOfYear, for: .now)?.start
                    if let thisWeek { proxy.scrollTo(thisWeek, anchor: .top) }
                }
            }
        }
    }

    private var weeks: [(start: Date, runs: [PlannedRun])] {
        let cal = Fmt.calendar
        let groups = Dictionary(grouping: store.plans) { cal.dateInterval(of: .weekOfYear, for: $0.day)!.start }
        // Block weeks with nothing planned still show, with their target.
        var starts = Set(groups.keys)
        for w in store.activeBlock?.weeks ?? [] { starts.insert(ISODate.day(w.weekStart)) }
        return starts.sorted().map { ($0, (groups[$0] ?? []).sorted { $0.date < $1.date }) }
    }

    private func weekInfo(_ start: Date) -> BlockWeek? {
        let key = ISODate.dayString(start)
        return store.activeBlock?.weeks.first { $0.weekStart == key }
    }
}

private struct BlockHeader: View {
    let block: TrainingBlock

    var body: some View {
        let cal = Fmt.calendar
        let start = ISODate.day(block.startDate), end = ISODate.day(block.endDate)
        let total = max(cal.dateComponents([.day], from: start, to: end).day ?? 1, 1)
        let done = min(max(cal.dateComponents([.day], from: start, to: .now).day ?? 0, 0), total)
        let race = block.raceDate.map(ISODate.day)
        let daysToRace = race.map { cal.dateComponents([.day], from: cal.startOfDay(for: .now), to: $0).day ?? 0 }

        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(block.name).font(.display(40))
                    if let goal = block.goal {
                        Text(goal).font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                if let daysToRace, daysToRace >= 0 {
                    VStack(spacing: 0) {
                        Text("\(daysToRace)").font(.display(36)).monospacedDigit()
                        Text("dias").font(.caption).foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .glassEffect(.regular.tint(.volt.opacity(0.35)), in: .rect(cornerRadius: 18))
                }
            }
            ProgressView(value: Double(done), total: Double(total))
                .tint(.primary)
            HStack {
                Text(Fmt.shortDay(start))
                Spacer()
                Text("semana \(min(done / 7 + 1, block.weeks.count)) de \(block.weeks.count)")
                Spacer()
                Text(Fmt.shortDay(end))
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .glassCard(radius: 28)
    }
}

private struct WeekCard: View {
    let start: Date
    let runs: [PlannedRun]
    let info: BlockWeek?

    var body: some View {
        let cal = Fmt.calendar
        let isCurrent = cal.isDate(start, equalTo: .now, toGranularity: .weekOfYear)
        let doneKm = runs.compactMap(\.actualDistance).reduce(0, +) / 1000
        let plannedKm = info?.targetKm ?? runs.compactMap(\.distance).reduce(0, +) / 1000

        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(Fmt.weekRange(start)).font(.headline)
                        if let phase = info?.phase {
                            Text(Labels.phase(phase))
                                .font(.caption2.weight(.semibold))
                                .padding(.horizontal, 7)
                                .padding(.vertical, 2)
                                .background(.primary.opacity(0.08), in: .capsule)
                        }
                    }
                    if let focus = info?.focus {
                        Text(focus).font(.caption).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Text("\(String(format: "%.0f", doneKm))/\(String(format: "%.0f", plannedKm)) km")
                    .font(.subheadline.monospacedDigit().weight(.semibold))
            }
            if plannedKm > 0 {
                ProgressView(value: min(doneKm, plannedKm), total: plannedKm)
                    .tint(doneKm >= plannedKm * 0.9 ? .green : .primary)
            }
            ForEach(runs) { run in
                NavigationLink(value: run) { PlanRow(run: run) }
                    .buttonStyle(.plain)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassEffect(isCurrent ? .regular.tint(.volt.opacity(0.18)) : .regular, in: .rect(cornerRadius: 24))
    }
}

private struct PlanRow: View {
    let run: PlannedRun

    var body: some View {
        let today = Fmt.calendar.isDateInToday(run.day)
        HStack(spacing: 12) {
            VStack(spacing: 0) {
                Text(run.day.formatted(.dateTime.weekday(.abbreviated).locale(Fmt.locale)).uppercased())
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(run.day.formatted(.dateTime.day()))
                    .font(.display(24))
            }
            .frame(width: 40)
            .padding(.vertical, 4)
            .background(today ? AnyShapeStyle(Color.volt.opacity(0.5)) : AnyShapeStyle(.clear), in: .rect(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 2) {
                Text(run.shortTitle ?? Labels.runType(run.type))
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            statusIcon
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
        }
        .contentShape(.rect)
        .opacity(run.status == "skipped" ? 0.5 : 1)
    }

    private var detail: String {
        var parts = [Labels.runType(run.type)]
        if let d = run.actualDistance {
            parts.append("\(Fmt.km(d, digits: 1)) km feitos")
        } else if let d = run.plannedDistance {
            parts.append("\(Fmt.km(d, digits: 1)) km")
        } else if let s = run.durationSec {
            parts.append(Fmt.duration(s))
        }
        if let rpe = run.compliance?.rpe { parts.append("RPE \(Int(rpe))") }
        return parts.joined(separator: " · ")
    }

    @ViewBuilder private var statusIcon: some View {
        switch run.status {
        case "done":
            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
        case "partial":
            Image(systemName: "circle.lefthalf.filled").foregroundStyle(.orange)
        case "skipped":
            Image(systemName: "xmark.circle").foregroundStyle(.secondary)
        default:
            if run.garminWorkoutId != nil {
                Image(systemName: "applewatch").foregroundStyle(.secondary)
            } else {
                Image(systemName: "circle").foregroundStyle(.tertiary)
            }
        }
    }
}
