import MapKit
import UIKit

/// An Apple Maps snapshot with the route drawn on it, light and dark. Widgets
/// can't host a live `Map`, so the provider renders these when it refreshes.
struct RouteSnapshot {
    let light: UIImage
    let dark: UIImage

    static func make(_ coords: [CLLocationCoordinate2D], size: CGSize) async -> RouteSnapshot? {
        guard coords.count > 1, size.width > 0, size.height > 0 else { return nil }
        async let light = render(coords, size: size, style: .light)
        async let dark = render(coords, size: size, style: .dark)
        guard let l = await light, let d = await dark else { return nil }
        return RouteSnapshot(light: l, dark: d)
    }

    private static func render(_ coords: [CLLocationCoordinate2D], size: CGSize, style: UIUserInterfaceStyle) async -> UIImage? {
        let options = MKMapSnapshotter.Options()
        options.mapRect = fitted(coords, to: size)
        options.size = size
        options.traitCollection = UITraitCollection(userInterfaceStyle: style)
        options.pointOfInterestFilter = .excludingAll
        options.showsBuildings = false

        guard let snapshot = try? await MKMapSnapshotter(options: options).start() else { return nil }

        return UIGraphicsImageRenderer(size: size, format: .init(for: options.traitCollection)).image { ctx in
            snapshot.image.draw(at: .zero)
            let points = coords.map(snapshot.point(for:))
            let path = UIBezierPath()
            path.move(to: points[0])
            points.dropFirst().forEach(path.addLine(to:))
            path.lineCapStyle = .round
            path.lineJoinStyle = .round

            // A dark casing keeps the volt line readable on the light map.
            UIColor.black.withAlphaComponent(style == .dark ? 0.5 : 0.35).setStroke()
            path.lineWidth = 6
            path.stroke()
            UIColor(red: 0xD4 / 255, green: 1, blue: 0, alpha: 1).setStroke()
            path.lineWidth = 3.5
            path.stroke()

            dot(at: points[0], color: .systemGreen, in: ctx.cgContext)
            dot(at: points[points.count - 1], color: .systemRed, in: ctx.cgContext)
        }
    }

    private static func dot(at p: CGPoint, color: UIColor, in ctx: CGContext) {
        let r: CGFloat = 4.5
        let rect = CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2)
        ctx.setFillColor(color.cgColor)
        ctx.fillEllipse(in: rect)
        ctx.setStrokeColor(UIColor.white.cgColor)
        ctx.setLineWidth(1.5)
        ctx.strokeEllipse(in: rect)
    }

    /// The route's bounds plus a margin, widened to the image's aspect ratio
    /// so the snapshot neither crops nor stretches it.
    private static func fitted(_ coords: [CLLocationCoordinate2D], to size: CGSize) -> MKMapRect {
        let pts = coords.map(MKMapPoint.init)
        let xs = pts.map(\.x), ys = pts.map(\.y)
        var w = xs.max()! - xs.min()!, h = ys.max()! - ys.min()!
        let cx = xs.min()! + w / 2, cy = ys.min()! + h / 2
        w = max(w * 1.3, 400)
        h = max(h * 1.3, 400)
        let aspect = size.width / size.height
        if w / h > aspect { h = w / aspect } else { w = h * aspect }
        return MKMapRect(x: cx - w / 2, y: cy - h / 2, width: w, height: h)
    }
}
