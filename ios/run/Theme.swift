import SwiftUI

/// A content card on Liquid Glass.
struct GlassCard: ViewModifier {
    var radius: CGFloat = 24
    var interactive = false

    func body(content: Content) -> some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .glassEffect(interactive ? .regular.interactive() : .regular, in: .rect(cornerRadius: radius))
    }
}

extension View {
    func glassCard(radius: CGFloat = 24, interactive: Bool = false) -> some View {
        modifier(GlassCard(radius: radius, interactive: interactive))
    }
}

/// A soft, slowly drifting colour field behind the content, so the glass has
/// something to refract instead of sitting on a flat fill.
struct AppBackground: View {
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let dark = scheme == .dark
        MeshGradient(
            width: 3, height: 3,
            points: [
                [0, 0], [0.5, 0], [1, 0],
                [0, 0.5], [0.6, 0.4], [1, 0.5],
                [0, 1], [0.5, 1], [1, 1],
            ],
            colors: dark
                ? [.black, .black, Color.volt.opacity(0.35),
                   .black, Color(white: 0.08), .black,
                   Color(red: 0.05, green: 0.2, blue: 0.35), .black, .black]
                : [.white, Color(white: 0.96), Color.volt.opacity(0.55),
                   Color(white: 0.97), .white, Color(white: 0.95),
                   Color(red: 0.75, green: 0.88, blue: 1), .white, Color(white: 0.96)]
        )
        .ignoresSafeArea()
    }
}

/// A labelled number: "6,41" over "km".
struct Metric: View {
    let value: String
    let label: String
    var size: CGFloat = 28

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(value)
                .font(.display(size))
                .monospacedDigit()
                .contentTransition(.numericText())
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

struct ErrorState: View {
    let error: Error
    let retry: () async -> Void

    var body: some View {
        ContentUnavailableView {
            Label("Não carregou", systemImage: "wifi.exclamationmark")
        } description: {
            Text(error.localizedDescription)
        } actions: {
            Button("Tentar de novo") { Task { await retry() } }
                .buttonStyle(.glassProminent)
        }
    }
}
