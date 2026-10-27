import SwiftUI

enum FeedSort: String, CaseIterable, Identifiable {
    case date = "Data", distance = "Distância", pace = "Pace", time = "Tempo"
    var id: Self { self }

    func sorted(_ items: [Activity]) -> [Activity] {
        switch self {
        case .date: items.sorted { $0.startDate > $1.startDate }
        case .distance: items.sorted { $0.distance > $1.distance }
        case .pace: items.filter { $0.distance >= 1000 }.sorted { ($0.paceSecPerKm ?? .infinity) < ($1.paceSecPerKm ?? .infinity) }
        case .time: items.sorted { $0.movingTime > $1.movingTime }
        }
    }
}

struct ActivitiesView: View {
    @Environment(Store.self) private var store
    @State private var sort: FeedSort = .date
    @State private var syncing = false
    @State private var syncMessage: String?
    @State private var askToken = false
    @State private var path: [Activity] = []
    @Namespace private var zoom

    var body: some View {
        NavigationStack(path: $path) {
            ZStack {
                AppBackground()
                content
            }
            .navigationTitle("Corridas")
            .navigationDestination(for: Activity.self) { a in
                ActivityDetailView(activity: a)
                    .navigationTransition(.zoom(sourceID: a.id, in: zoom))
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Ordenar", selection: $sort.animation()) {
                            ForEach(FeedSort.allCases) { Text($0.rawValue).tag($0) }
                        }
                    } label: {
                        Label("Ordenar", systemImage: "arrow.up.arrow.down")
                    }
                }
                ToolbarSpacer(.fixed, placement: .topBarTrailing)
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        if store.writeToken == nil { askToken = true } else { Task { await sync() } }
                    } label: {
                        if syncing {
                            ProgressView()
                        } else {
                            Label("Sincronizar Garmin", systemImage: "arrow.triangle.2.circlepath")
                        }
                    }
                    .disabled(syncing)
                }
            }
            .sheet(isPresented: $askToken) {
                TokenSheet { Task { await sync() } }
            }
            .overlay(alignment: .top) {
                if let syncMessage {
                    Text(syncMessage)
                        .font(.subheadline.weight(.medium))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .glassEffect(.regular.tint(.volt.opacity(0.3)))
                        .transition(.move(edge: .top).combined(with: .opacity))
                        .padding(.top, 4)
                }
            }
        }
        .task {
            if !store.loadedFeed { await store.loadFeed() }
            openPending()
        }
        .onChange(of: store.openActivityID) { openPending() }
    }

    /// Push the run a widget tap asked for, once the feed has it.
    private func openPending() {
        guard let id = store.openActivityID, let a = store.activities.first(where: { $0.id == id }) else { return }
        path = [a]
        store.openActivityID = nil
    }

    @ViewBuilder private var content: some View {
        if !store.loadedFeed {
            ProgressView()
        } else if let error = store.feedError, store.activities.isEmpty {
            ErrorState(error: error) { await store.loadFeed() }
        } else {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12, pinnedViews: sort == .date ? [.sectionHeaders] : []) {
                    if sort == .date {
                        ForEach(months, id: \.month) { group in
                            Section {
                                ForEach(group.items) { card($0) }
                            } header: {
                                MonthHeader(month: group.month, items: group.items)
                            }
                        }
                    } else {
                        ForEach(sort.sorted(store.activities)) { card($0) }
                    }
                }
                .padding(.horizontal)
                .padding(.bottom, 24)
            }
            .refreshable { await store.loadFeed() }
        }
    }

    private func card(_ a: Activity) -> some View {
        NavigationLink(value: a) {
            RunCard(activity: a)
                .matchedTransitionSource(id: a.id, in: zoom)
        }
        .buttonStyle(.plain)
    }

    private var months: [(month: Date, items: [Activity])] {
        let cal = Fmt.calendar
        let sorted = FeedSort.date.sorted(store.activities)
        let groups = Dictionary(grouping: sorted) {
            cal.date(from: cal.dateComponents([.year, .month], from: $0.date))!
        }
        return groups.keys.sorted(by: >).map { ($0, groups[$0]!) }
    }

    private func sync() async {
        guard let token = store.writeToken else { return }
        syncing = true
        defer { syncing = false }
        do {
            let r = try await API.syncGarmin(token: token)
            await store.loadFeed()
            show(r.imported == 0 ? "Nada novo no Garmin" : "\(r.imported) corrida\(r.imported == 1 ? "" : "s") nova\(r.imported == 1 ? "" : "s")")
        } catch APIError.status(401, _) {
            store.writeToken = nil
            askToken = true
        } catch {
            show(error.localizedDescription)
        }
    }

    private func show(_ message: String) {
        withAnimation(.spring) { syncMessage = message }
        Task {
            try? await Task.sleep(for: .seconds(3))
            withAnimation(.spring) { syncMessage = nil }
        }
    }
}

private struct MonthHeader: View {
    let month: Date
    let items: [Activity]

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(Fmt.month(month).prefix(1).uppercased() + Fmt.month(month).dropFirst())
                .font(.headline)
            Spacer()
            Text("\(Fmt.km(items.reduce(0) { $0 + $1.distance }, digits: 1)) km · \(items.count)")
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .glassEffect()
        .padding(.top, 8)
    }
}

struct RunCard: View {
    let activity: Activity

    var body: some View {
        HStack(spacing: 14) {
            RouteThumb(activity: activity)
                .frame(width: 72, height: 72)

            VStack(alignment: .leading, spacing: 6) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(activity.name)
                        .font(.headline)
                        .lineLimit(1)
                    Text(Fmt.runWhen(activity.date))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                HStack(spacing: 18) {
                    Metric(value: Fmt.km(activity.distance), label: "km", size: 24)
                    Metric(value: Fmt.pace(activity.paceSecPerKm), label: "/km", size: 24)
                    Metric(value: Fmt.duration(activity.movingTime), label: "tempo", size: 24)
                }
            }
            Spacer(minLength: 0)
        }
        .glassCard(interactive: true)
    }
}

struct RouteThumb: View {
    let activity: Activity

    var body: some View {
        let coords = activity.thumb.map { decodePolyline($0, precision: 4) } ?? []
        ZStack {
            RoundedRectangle(cornerRadius: 16)
                .fill(.primary.opacity(0.06))
            if coords.count > 1 {
                RouteShape(coords: coords)
                    .stroke(.tint, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
                    .padding(10)
            } else {
                Image(systemName: activity.indoor == true ? "figure.run.treadmill" : "figure.run")
                    .font(.title2)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

struct SearchView: View {
    @Environment(Store.self) private var store
    @State private var query = ""

    var body: some View {
        NavigationStack {
            List(results) { a in
                NavigationLink(value: a) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(a.name).font(.headline)
                        Text("\(Fmt.runWhen(a.date)) · \(Fmt.km(a.distance)) km · \(Fmt.pace(a.paceSecPerKm))/km")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .overlay {
                if !query.isEmpty && results.isEmpty { ContentUnavailableView.search(text: query) }
            }
            .navigationTitle("Buscar")
            .navigationDestination(for: Activity.self) { ActivityDetailView(activity: $0) }
            .searchable(text: $query, prompt: "Nome da corrida")
        }
        .task {
            if !store.loadedFeed { await store.loadFeed() }
        }
    }

    private var results: [Activity] {
        guard !query.isEmpty else { return [] }
        return FeedSort.date.sorted(store.activities).filter {
            $0.name.localizedStandardContains(query)
        }
    }
}
