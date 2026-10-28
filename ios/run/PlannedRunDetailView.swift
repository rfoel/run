import SwiftUI

/// One planned session: the target, the structured steps, the coach's notes
/// and, once run, how it went with a link to the activity.
struct PlannedRunDetailView: View {
    @Environment(Store.self) private var store
    let run: PlannedRun

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                header
                if run.status == "done" || run.status == "partial" {
                    ActualCard(run: run, activity: activity)
                }
                if let workout = run.workout, !workout.elements.isEmpty {
                    StepsCard(workout: workout)
                }
                if let notes = run.notes, !notes.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Notas").font(.headline)
                        Text(notes).font(.subheadline).foregroundStyle(.secondary)
                    }
                    .glassCard()
                }
                if let id = run.garminWorkoutId, activity == nil,
                   let url = URL(string: "https://connect.garmin.com/app/workout/\(id)?workoutType=running") {
                    Link(destination: url) {
                        Label("Abrir no Garmin Connect", systemImage: "applewatch")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.glass)
                    .controlSize(.large)
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 32)
        }
        .background { AppBackground() }
        .navigationTitle(run.shortTitle ?? Labels.runType(run.type))
        .navigationBarTitleDisplayMode(.inline)
    }

    private var activity: Activity? {
        guard let src = run.actualSource, let ext = run.actualExternalId else { return nil }
        return store.activity(source: src, externalId: ext)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    let weekday = run.day.formatted(.dateTime.weekday(.wide).locale(Fmt.locale))
                    Text(weekday.prefix(1).uppercased() + weekday.dropFirst())
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Text(run.day.formatted(.dateTime.day().month(.wide).locale(Fmt.locale)))
                        .font(.display(32))
                }
                Spacer()
                StatusPill(status: run.status)
            }
            if run.plannedDistance != nil || run.durationSec != nil || run.paceTargetSec != nil {
                HStack(alignment: .firstTextBaseline, spacing: 20) {
                    if let d = run.plannedDistance {
                        Metric(value: Fmt.km(d, digits: 1), label: "km planejados", size: 44)
                    } else if let s = run.durationSec {
                        Metric(value: Fmt.duration(s), label: "tempo planejado", size: 44)
                    }
                    if let p = run.paceTargetSec {
                        Metric(value: Fmt.pace(p), label: "pace alvo /km")
                    }
                    Spacer(minLength: 0)
                }
            }
            Text(Labels.runType(run.type))
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(.primary.opacity(0.08), in: .capsule)
        }
        .glassCard(radius: 28)
    }
}

private struct StatusPill: View {
    let status: String

    var body: some View {
        let (icon, tint): (String, Color) = switch status {
        case "done": ("checkmark.circle.fill", .green)
        case "partial": ("circle.lefthalf.filled", .orange)
        case "skipped": ("xmark.circle", .gray)
        default: ("circle", .volt)
        }
        Label(Labels.status(status), systemImage: icon)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .glassEffect(.regular.tint(tint.opacity(0.35)))
    }
}

/// What was actually run against the plan, and the way into the activity.
private struct ActualCard: View {
    let run: PlannedRun
    let activity: Activity?

    var body: some View {
        let c = run.compliance
        let pace = run.actualDistance.flatMap { d in
            run.actualMovingTime.map { $0 / (d / 1000) }
        }
        let items: [(String, String)] = [
            run.actualDistance.map { (Fmt.km($0), "km feitos") },
            run.actualMovingTime.map { (Fmt.duration($0), "tempo") },
            pace.map { (Fmt.pace($0), "pace /km") },
            run.actualAvgHr.map { ("\(Int($0))", "FC média") },
            c?.volumePct.map { ("\(Int(($0 * 100).rounded()))%", "do volume") },
            c?.rpe.map { ("\(Int($0))", "RPE") },
        ].compactMap { $0 }

        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Realizado").font(.headline)
                Spacer()
                if let hit = c?.targetHit {
                    Label(hit ? "Alvo atingido" : "Fora do alvo", systemImage: hit ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(hit ? .green : .orange)
                }
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), alignment: .leading), count: 3), spacing: 14) {
                ForEach(items, id: \.1) { Metric(value: $0.0, label: $0.1) }
            }
            if let pattern = c?.pattern {
                Label(Labels.pattern(pattern), systemImage: "waveform.path.ecg")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            if let activity {
                NavigationLink(value: activity) {
                    HStack {
                        Text("Ver corrida").font(.subheadline.weight(.semibold))
                        Spacer()
                        Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
                    }
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
            }
        }
        .glassCard()
    }
}

/// The structured workout, one row per step and repeats grouped.
private struct StepsCard: View {
    let workout: StructuredWorkout

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("Estrutura").font(.headline)
                Spacer()
                if let d = workout.distance {
                    Text("\(Fmt.km(d, digits: 1)) km")
                        .font(.subheadline.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
            ForEach(Array(workout.elements.enumerated()), id: \.offset) { _, el in
                if let reps = el.repeat, let steps = el.steps, !steps.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("\(reps)×").font(.display(24))
                        ForEach(Array(steps.enumerated()), id: \.offset) { _, s in StepRow(step: s) }
                    }
                    .padding(12)
                    .background(.primary.opacity(0.05), in: .rect(cornerRadius: 16))
                } else if el.kind != nil, el.duration != nil {
                    StepRow(step: el.asStep)
                }
            }
        }
        .glassCard()
    }
}

private struct StepRow: View {
    let step: WorkoutStep

    var body: some View {
        HStack(spacing: 10) {
            Capsule().fill(color).frame(width: 4, height: 32)
            VStack(alignment: .leading, spacing: 0) {
                Text(label).font(.caption).foregroundStyle(.secondary)
                Text(StructuredWorkout.durationText(step.duration))
                    .font(.subheadline.weight(.semibold).monospacedDigit())
            }
            Spacer(minLength: 0)
            if let target = StructuredWorkout.targetText(step) {
                Text(target).font(.subheadline.monospacedDigit())
            }
        }
    }

    private var label: String {
        switch step.kind {
        case "warmup": "Aquecimento"
        case "cooldown": "Desaquecimento"
        case "recovery": "Trote"
        case "rest": "Parado"
        default: "Corrida"
        }
    }

    private var color: Color {
        switch step.kind {
        case "warmup", "cooldown": .blue
        case "recovery", "rest": .secondary.opacity(0.4)
        default: .volt
        }
    }
}
