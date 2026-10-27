import SwiftUI

extension Color {
    /// The web's highlight (`--volt`).
    static let volt = Color(red: 0xD4 / 255, green: 1, blue: 0)
}

extension ShapeStyle where Self == Color {
    static var volt: Color { .volt }
}

extension Font {
    /// Big display numbers — condensed, like the web's League Gothic.
    static func display(_ size: CGFloat) -> Font {
        .system(size: size, weight: .bold, design: .default).width(.compressed)
    }
}
