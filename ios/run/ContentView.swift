import SwiftUI

enum AppTab: Hashable {
    case runs, plan, summary, search
}

struct ContentView: View {
    @Environment(Store.self) private var store
    @State private var tab: AppTab = {
        #if DEBUG
        // `-tab plan|summary|search` opens on that tab, for screenshots.
        switch UserDefaults.standard.string(forKey: "tab") {
        case "plan": return .plan
        case "summary": return .summary
        case "search": return .search
        default: break
        }
        #endif
        return .runs
    }()

    var body: some View {
        TabView(selection: $tab) {
            Tab("Corridas", systemImage: "figure.run", value: .runs) {
                ActivitiesView()
            }
            Tab("Plano", systemImage: "calendar", value: .plan) {
                PlanView()
            }
            Tab("Resumo", systemImage: "chart.bar.fill", value: .summary) {
                SummaryView()
            }
            Tab(value: .search, role: .search) {
                SearchView()
            }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        .tabViewBottomAccessory {
            NextRunAccessory { tab = .plan }
        }
        .onOpenURL(perform: open)
        .task {
            // The accessory needs the plan on launch, whatever tab is open.
            if !store.loadedPlan { await store.loadPlan() }
        }
    }
}

extension ContentView {
    /// Widget taps: `run://plan`, `run://activity/<source>/<externalId>`.
    private func open(_ url: URL) {
        switch url.host() {
        case "plan":
            tab = .plan
        case "activity":
            tab = .runs
            store.openActivityID = url.pathComponents.dropFirst().joined(separator: "/")
        default:
            break
        }
    }
}

/// The next planned session, riding above the tab bar.
struct NextRunAccessory: View {
    @Environment(Store.self) private var store
    @Environment(\.tabViewBottomAccessoryPlacement) private var placement
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: 10) {
                Image(systemName: "figure.run.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.tint)
                if let run = store.nextRun {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(run.shortTitle ?? Labels.runType(run.type))
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
                        if placement != .inline {
                            Text(nextLabel(run))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                } else {
                    Text(store.loadedPlan ? "Nada planejado" : "Carregando plano…")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                if let d = store.nextRun?.plannedDistance, placement != .inline {
                    Text("\(Fmt.km(d, digits: 1)) km")
                        .font(.subheadline.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 16)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }

    private func nextLabel(_ run: PlannedRun) -> String {
        let cal = Fmt.calendar
        if cal.isDateInToday(run.day) { return "Hoje · \(Labels.runType(run.type))" }
        if cal.isDateInTomorrow(run.day) { return "Amanhã · \(Labels.runType(run.type))" }
        return "\(Fmt.shortDay(run.day)) · \(Labels.runType(run.type))"
    }
}

/// Write password prompt, used before any write action (Garmin sync).
struct TokenSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var token = ""
    @State private var checking = false
    @State private var failed = false
    let onSaved: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    SecureField("Senha de escrita", text: $token)
                        .textContentType(.password)
                        .onSubmit { Task { await save() } }
                } footer: {
                    Text(failed ? "Senha incorreta." : "Fica salva no Keychain deste iPhone.")
                        .foregroundStyle(failed ? .red : .secondary)
                }
            }
            .navigationTitle("Desbloquear")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(role: .confirm) { Task { await save() } }
                        .disabled(token.isEmpty || checking)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func save() async {
        checking = true
        defer { checking = false }
        if await API.verify(token: token) {
            store.writeToken = token
            dismiss()
            onSaved()
        } else {
            failed = true
        }
    }
}
