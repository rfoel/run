import SwiftUI

struct SummaryView: View {
    @Environment(Store.self) private var store

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackground()
                content
            }
            .navigationTitle("Resumo")
            .navigationDestination(for: Activity.self) { ActivityDetailView(activity: $0) }
        }
        .task {
            if !store.loadedSummary { await store.loadSummary() }
            if !store.loadedFeed { await store.loadFeed() }
        }
    }

    @ViewBuilder private var content: some View {
        if !store.loadedSummary {
            ProgressView()
        } else if let error = store.summaryError, store.stats == nil {
            ErrorState(error: error) { await store.loadSummary() }
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if let stats = store.stats {
                        GlassEffectContainer(spacing: 12) {
                            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                                if let s = stats.week { StatTile(title: "Semana", stat: s, highlight: true) }
                                if let s = stats.month { StatTile(title: "Mês", stat: s) }
                                if let s = stats.year { StatTile(title: "Ano", stat: s) }
                                if let s = stats.total { StatTile(title: "Total", stat: s) }
                            }
                        }
                    }
                    if !store.records.isEmpty {
                        RecordsCard(records: store.records)
                    }
                }
                .padding(.horizontal)
                .padding(.bottom, 24)
            }
            .refreshable { await store.loadSummary() }
        }
    }
}

private struct StatTile: View {
    let title: String
    let stat: Stat
    var highlight = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(Fmt.km(stat.distance, digits: stat.distance >= 100_000 ? 0 : 1))
                    .font(.display(44))
                    .monospacedDigit()
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text("km").font(.subheadline).foregroundStyle(.secondary)
            }
            HStack(spacing: 10) {
                Label("\(stat.count)", systemImage: "figure.run")
                Label(stat.movingTime >= 36_000 ? Fmt.hours(stat.movingTime) : Fmt.duration(stat.movingTime), systemImage: "clock")
            }
            .font(.caption.monospacedDigit())
            .foregroundStyle(.secondary)
            .labelStyle(.titleAndIcon)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassEffect(highlight ? .regular.tint(.volt.opacity(0.3)) : .regular, in: .rect(cornerRadius: 24))
    }
}

private struct RecordsCard: View {
    @Environment(Store.self) private var store
    let records: [AllTimeRecord]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Recordes").font(.headline)
            ForEach(records) { r in
                let row = HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(r.label).font(.subheadline.weight(.semibold))
                        Text(ISODate.parse(r.startDate).formatted(.dateTime.day().month(.abbreviated).year().locale(Fmt.locale)))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 1) {
                        Text(Fmt.clock(r.timeSec)).font(.display(26)).monospacedDigit()
                        Text("\(Fmt.pace(r.paceSecPerKm))/km").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                    }
                }
                .contentShape(.rect)

                if let a = store.activity(source: r.source, externalId: r.externalId) {
                    NavigationLink(value: a) { row }.buttonStyle(.plain)
                } else {
                    row
                }
                if r.id != records.last?.id { Divider() }
            }
        }
        .glassCard()
    }
}
