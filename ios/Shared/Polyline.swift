import CoreLocation
import SwiftUI

/// Decode a Google encoded polyline. Stored routes use precision 5, list
/// thumbnails precision 4 (see @run/core/heatmap).
func decodePolyline(_ str: String, precision: Int = 5) -> [CLLocationCoordinate2D] {
    let bytes = Array(str.utf8)
    let factor = pow(10, Double(precision))
    var i = 0, lat = 0, lng = 0
    var coords: [CLLocationCoordinate2D] = []

    func next() -> Int? {
        var result = 0, shift = 0, b = 0
        repeat {
            guard i < bytes.count else { return nil }
            b = Int(bytes[i]) - 63
            i += 1
            result |= (b & 0x1f) << shift
            shift += 5
        } while b >= 0x20
        return result & 1 != 0 ? ~(result >> 1) : result >> 1
    }

    while i < bytes.count {
        guard let dLat = next(), let dLng = next() else { break }
        lat += dLat
        lng += dLng
        coords.append(CLLocationCoordinate2D(latitude: Double(lat) / factor, longitude: Double(lng) / factor))
    }
    return coords
}

/// A route drawn to fit its frame, keeping its real proportions.
struct RouteShape: Shape {
    let coords: [CLLocationCoordinate2D]

    func path(in rect: CGRect) -> Path {
        var path = Path()
        guard coords.count > 1 else { return path }
        let lats = coords.map(\.latitude), lngs = coords.map(\.longitude)
        let minLat = lats.min()!, maxLat = lats.max()!, minLng = lngs.min()!, maxLng = lngs.max()!
        // Longitude degrees shrink with latitude; scale them so the shape isn't stretched.
        let k = cos((minLat + maxLat) / 2 * .pi / 180)
        let w = max((maxLng - minLng) * k, 1e-9), h = max(maxLat - minLat, 1e-9)
        let scale = min(rect.width / w, rect.height / h)
        let ox = rect.midX - w * scale / 2, oy = rect.midY - h * scale / 2

        for (n, c) in coords.enumerated() {
            let p = CGPoint(x: ox + (c.longitude - minLng) * k * scale, y: oy + (maxLat - c.latitude) * scale)
            n == 0 ? path.move(to: p) : path.addLine(to: p)
        }
        return path
    }
}
