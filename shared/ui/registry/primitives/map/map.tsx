"use client"

// Map — a DATA-BOUND interactive map (Leaflet). Pins come from your records,
// located by `config.addressField` ("lat,lng"), labelled by `config.captionField`.
// Street or satellite tiles via `config.visualType`; zoom via `config.zoom`.
//
// Leaflet needs the browser, so load this MAP ONLY ON THE CLIENT — e.g.
//   const Map = dynamic(() => import(".../map/map").then(m => m.Map), { ssr:false })
// (importing it on the server throws "window is not defined").
//
// Roadmap: live address geocoding + marker clustering (config.cluster) — declared
// in MapConfig, layered on next.

import * as React from "react"
import L from "leaflet"
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet"
import "leaflet/dist/leaflet.css"

import { type MapConfig } from "../../../lib/config"
import { cn } from "../../../lib/utils"
import { AspectRatio } from "../aspect-ratio/aspect-ratio"

const TILES = {
  street: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "© Esri",
  },
}

// A token-styled pin — avoids Leaflet's bundler-broken default icon asset paths.
// The pin is injected into the document, so `var(--primary)` resolves against the
// live theme like any other node. It used to carry a `#14b8a6` fallback beside
// it — the library's old teal, which the app has never used and which only a
// missing token could ever have shown. A fallback nobody can reach is a colour
// that survives a re-theme in the one place no one looks (R32).
const pin = L.divIcon({
  className: "",
  html: '<div style="width:14px;height:14px;border-radius:9999px;background:var(--primary);border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.45)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

function parseLatLng(v: unknown): [number, number] | null {
  if (typeof v !== "string") return null
  const p = v.split(",").map((s) => Number(s.trim()))
  return p.length === 2 && p.every((n) => !Number.isNaN(n))
    ? [p[0], p[1]]
    : null
}

function Map({
  data = [],
  config,
  ratio = 16 / 9,
  className,
}: {
  data?: Array<Record<string, unknown>>
  config: MapConfig
  ratio?: number
  className?: string
}) {
  const points = data
    .map((r) => ({
      pt: parseLatLng(r[config.addressField]),
      caption: String(r[config.captionField] ?? ""),
    }))
    .filter(
      (p): p is { pt: [number, number]; caption: string } => p.pt !== null
    )

  const center: [number, number] = points.length
    ? [
        points.reduce((s, p) => s + p.pt[0], 0) / points.length,
        points.reduce((s, p) => s + p.pt[1], 0) / points.length,
      ]
    : [51.505, -0.09]

  const tiles = TILES[config.visualType] ?? TILES.street

  return (
    <div className={cn("w-full overflow-hidden rounded-xl border", className)}>
      <AspectRatio ratio={ratio}>
        <MapContainer
          center={center}
          zoom={config.zoom}
          scrollWheelZoom={false}
          className="size-full"
        >
          <TileLayer url={tiles.url} attribution={tiles.attribution} />
          {points.map((p, i) => (
            <Marker key={i} position={p.pt} icon={pin}>
              {p.caption && <Popup>{p.caption}</Popup>}
            </Marker>
          ))}
        </MapContainer>
      </AspectRatio>
    </div>
  )
}

export { Map }
