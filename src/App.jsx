import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, ImageOverlay, GeoJSON, Popup, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import * as GeoTIFF from "geotiff";
import chroma from "chroma-js";
import proj4 from "proj4";

const CONFIG = {
  RUTA_BASE: "C:/Users/pcc/Emgrisa, S.A/Aguas - Documentos/Test_EACC/rasters/",
  VARS: ["ETP", "PRE"],
  HORS: ["2030_2060", "2050_2080", "2070_2100"],
  ESCS: ["ssp4", "ssp8"],
  TIPOS: [
    { clave: "mean", label: "Valor absoluto" },
    { clave: "abs", label: "Variación absoluta" },
    { clave: "var", label: "Variación porcentual" },
  ],
  VAR_LABELS: {
    ETP: "Evapotranspiración potencial",
    PRE: "Precipitación acumulada",
  },
  HOR_LABELS: {
    "2030_2060": "2030 – 2060",
    "2050_2080": "2050 – 2080",
    "2070_2100": "2070 – 2100",
  },
  ESC_LABELS: { ssp4: "SSP4", ssp8: "SSP8" },
  UNIDADES: { ETP: "mm", PRE: "mm" },
  PALETAS: {
    mean: ["#1e3a8a", "#0ea5e9", "#fde68a", "#f97316", "#ef4444"],
    abs: ["#1d4ed8", "#93c5fd", "#f9fafb", "#fca5a5", "#dc2626"],
    var: ["#1d4ed8", "#93c5fd", "#f9fafb", "#fca5a5", "#dc2626"],
  },
  MAP_CENTER: [40.0, -3.7],
  MAP_ZOOM: 6,
};

proj4.defs("EPSG:25830", "+proj=utm +zone=30 +ellps=GRS80 +units=m +no_defs");

function nombreFichero(v, h, e, t) {
  return t === "mean" ? `${v}_${h}_${e}_mean.tif` : `${v}_${h}_${t}_${e}_mean.tif`;
}

function urlRaster(v, h, e, t) {
  return CONFIG.RUTA_BASE + nombreFichero(v, h, e, t);
}

function claveStr(v, h, e, t) {
  return `${v}|${h}|${e}|${t}`;
}

function getUnidad(v, t) {
  return t === "var" ? "%" : CONFIG.UNIDADES[v] || "";
}

function FitToBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds);
  }, [bounds, map]);
  return null;
}

function FlyToProvince({ provinceLayer }) {
  const map = useMap();
  useEffect(() => {
    if (!provinceLayer) {
      map.flyTo(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM, { duration: 0.5 });
    }
  }, [provinceLayer, map]);
  return null;
}

function MapClickReader({ layerData, activeKey }) {
  const [popup, setPopup] = useState(null);

  useMapEvents({
    click(e) {
      if (!layerData?.data || !activeKey) return;

      try {
        const [v, , , t] = activeKey.split("|");
        const unit = getUnidad(v, t);
        const utm = proj4("WGS84", "EPSG:25830", [e.latlng.lng, e.latlng.lat]);
        const bbox = layerData.bbox;

        const px = Math.floor(((utm[0] - bbox[0]) / (bbox[2] - bbox[0])) * layerData.width);
        const py = Math.floor(((bbox[3] - utm[1]) / (bbox[3] - bbox[1])) * layerData.height);

        if (px < 0 || py < 0 || px >= layerData.width || py >= layerData.height) return;

        const idx = py * layerData.width + px;
        const val = layerData.data[idx];
        if (val === layerData.nodata || Number.isNaN(val)) return;

        setPopup({
          latlng: e.latlng,
          value: Number(val).toFixed(4),
          unit,
          lat: e.latlng.lat.toFixed(5),
          lon: e.latlng.lng.toFixed(5),
        });
      } catch (err) {
        console.warn("No se pudo obtener el valor del pixel:", err);
      }
    },
  });

  if (!popup) return null;
  return (
    <Popup position={popup.latlng}>
      <div className="font-mono text-xs">
        <b className="text-sky-400">{popup.value} {popup.unit}</b><br />
        <span className="text-slate-400">{popup.lat}°N &nbsp; {popup.lon}°E</span>
      </div>
    </Popup>
  );
}

function Coordinates() {
  const [coords, setCoords] = useState({ lat: "—", lon: "—", zoom: CONFIG.MAP_ZOOM });
  const map = useMapEvents({
    mousemove(e) {
      setCoords(prev => ({ ...prev, lat: e.latlng.lat.toFixed(5), lon: e.latlng.lng.toFixed(5) }));
    },
    zoom() {
      setCoords(prev => ({ ...prev, zoom: map.getZoom() }));
    },
  });

  return (
    <div className="absolute bottom-0 left-[300px] right-0 z-[800] flex gap-5 border-t border-slate-800 bg-slate-950/80 px-4 py-1 font-mono text-[10px] text-slate-500">
      <div>LAT <span className="text-slate-200">{coords.lat}</span></div>
      <div>LON <span className="text-slate-200">{coords.lon}</span></div>
      <div>ZOOM <span className="text-slate-200">{coords.zoom}</span></div>
    </div>
  );
}

function LayerTree({ activeKey, onLoadLayer }) {
  const [openVars, setOpenVars] = useState({});
  const [openTipos, setOpenTipos] = useState({});

  return (
    <div className="flex-1 overflow-y-auto py-2">
      {CONFIG.VARS.map(v => (
        <div key={v}>
          <button
            className="mx-1 flex w-[calc(100%-8px)] items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-white/5"
            onClick={() => setOpenVars(prev => ({ ...prev, [v]: !prev[v] }))}
          >
            <span className={`text-[10px] text-slate-500 transition-transform ${openVars[v] ? "rotate-90" : ""}`}>▶</span>
            <span className="flex-1 text-xs font-semibold">{CONFIG.VAR_LABELS[v]}</span>
            <span className="rounded bg-sky-400/10 px-1.5 py-0.5 font-mono text-[9px] text-sky-400">{v}</span>
          </button>

          {openVars[v] && CONFIG.TIPOS.map(tipo => {
            const tipoKey = `${v}-${tipo.clave}`;
            return (
              <div key={tipoKey} className="pl-2">
                <button
                  className="mx-1 flex w-[calc(100%-8px)] items-center gap-2 rounded-md px-3 py-1.5 text-left text-[11px] text-slate-400 hover:bg-white/5"
                  onClick={() => setOpenTipos(prev => ({ ...prev, [tipoKey]: !prev[tipoKey] }))}
                >
                  <span className={`text-[9px] text-slate-700 transition-transform ${openTipos[tipoKey] ? "rotate-90" : ""}`}>▸</span>
                  <span>{tipo.label}</span>
                </button>

                {openTipos[tipoKey] && CONFIG.ESCS.map(esc => (
                  <div key={`${tipoKey}-${esc}`} className="pl-4">
                    <div className="px-3 pt-2 font-mono text-[9px] font-bold uppercase tracking-widest text-slate-700">
                      {CONFIG.ESC_LABELS[esc]}
                    </div>
                    {CONFIG.HORS.map(h => {
                      const key = claveStr(v, h, esc, tipo.clave);
                      const isActive = activeKey === key;
                      return (
                        <button
                          key={key}
                          onClick={() => onLoadLayer(v, h, esc, tipo.clave)}
                          className={`mx-1 flex w-[calc(100%-8px)] items-center gap-2 rounded-md px-3 py-1.5 font-mono text-[11px] transition ${isActive ? "bg-sky-400/10 text-slate-100" : "text-slate-500 hover:bg-sky-400/10 hover:text-slate-300"}`}
                        >
                          <span className={`h-2 w-2 rounded-full border ${isActive ? "border-sky-400 bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,.6)]" : "border-slate-700"}`} />
                          {CONFIG.HOR_LABELS[h]}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [status, setStatus] = useState("Sin capa cargada");
  const [statusColor, setStatusColor] = useState("text-slate-500");
  const [activeKey, setActiveKey] = useState(null);
  const [opacity, setOpacity] = useState(0.8);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [layerData, setLayerData] = useState(null);
  const [stats, setStats] = useState(null);
  const [provinces, setProvinces] = useState(null);
  const [selectedProvince, setSelectedProvince] = useState("");

  useEffect(() => {
    fetch("https://raw.githubusercontent.com/codeforgermany/click_that_hood/main/public/data/spain-provinces.geojson")
      .then(res => res.json())
      .then(setProvinces)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (progress >= 100) {
      const id = setTimeout(() => setProgress(0), 600);
      return () => clearTimeout(id);
    }
  }, [progress]);

  const provinceFeature = useMemo(() => {
    if (!provinces || !selectedProvince) return null;
    return provinces.features.find(f => f.properties.name === selectedProvince) || null;
  }, [provinces, selectedProvince]);

  async function cargarCapa(v, h, e, t) {
    const key = claveStr(v, h, e, t);
    if (key === activeKey) return;

    setLoading(true);
    setProgress(15);
    setStatus("Cargando...");
    setStatusColor("text-amber-300");

    try {
      const tiff = await GeoTIFF.fromUrl(urlRaster(v, h, e, t), { allowFullFile: true });
      setProgress(35);

      const image = await tiff.getImage();
      setProgress(50);

      const bbox = image.getBoundingBox();
      const width = image.getWidth();
      const height = image.getHeight();
      const nodata = image.getGDALNoData();
      const data = await image.readRasters({ interleave: true });
      setProgress(80);

      let vmin = Infinity;
      let vmax = -Infinity;
      let suma = 0;
      let count = 0;

      for (let i = 0; i < data.length; i++) {
        const value = data[i];
        if (value !== nodata && !Number.isNaN(value) && Number.isFinite(value)) {
          if (value < vmin) vmin = value;
          if (value > vmax) vmax = value;
          suma += value;
          count++;
        }
      }

      const vmean = suma / count;
      let sumaCuad = 0;
      for (let i = 0; i < data.length; i++) {
        const value = data[i];
        if (value !== nodata && !Number.isNaN(value) && Number.isFinite(value)) {
          sumaCuad += (value - vmean) ** 2;
        }
      }
      const vsd = Math.sqrt(sumaCuad / count);

      const escala = chroma.scale(CONFIG.PALETAS[t]).domain([vmin, vmax]);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      const imgData = ctx.createImageData(width, height);

      for (let i = 0; i < data.length; i++) {
        const val = data[i];
        const idx = i * 4;
        if (val === nodata || Number.isNaN(val) || !Number.isFinite(val)) {
          imgData.data[idx + 3] = 0;
          continue;
        }
        const col = escala(val).rgb();
        imgData.data[idx] = col[0];
        imgData.data[idx + 1] = col[1];
        imgData.data[idx + 2] = col[2];
        imgData.data[idx + 3] = Math.round(opacity * 255);
      }
      ctx.putImageData(imgData, 0, 0);
      setProgress(95);

      let bounds;
      try {
        const sw = proj4("EPSG:25830", "WGS84", [bbox[0], bbox[1]]);
        const ne = proj4("EPSG:25830", "WGS84", [bbox[2], bbox[3]]);
        bounds = [[sw[1], sw[0]], [ne[1], ne[0]]];
      } catch {
        bounds = [[33.5, -13.5], [44.0, 5.0]];
      }

      setLayerData({
        imageUrl: canvas.toDataURL(),
        bounds,
        data,
        width,
        height,
        bbox,
        nodata,
        vmin,
        vmax,
        palette: CONFIG.PALETAS[t],
      });
      setStats({ v, h, e, t, vmin, vmax, vmean, vsd });
      setActiveKey(key);
      setStatus(`${v} · ${CONFIG.HOR_LABELS[h]} · ${CONFIG.ESC_LABELS[e]}`);
      setStatusColor("text-cyan-300");
      setProgress(100);
    } catch (err) {
      console.error(err);
      setStatus("Error");
      setStatusColor("text-red-400");
      alert(`Error al cargar la capa:\n${err.message}`);
      setProgress(0);
    } finally {
      setLoading(false);
    }
  }

  const unit = stats ? getUnidad(stats.v, stats.t) : "";
  const tipoLabel = stats ? CONFIG.TIPOS.find(tp => tp.clave === stats.t)?.label : "";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-200">
      <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-5">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 animate-pulse rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8]" />
          <div>
            <h1 className="text-sm font-semibold">Visor GIS Climático</h1>
            <span className="font-mono text-[10px] text-slate-500">EACC · COG · React</span>
          </div>
        </div>
        <div className={`font-mono text-[11px] ${statusColor}`}>{status}</div>
      </header>

      <main className="relative flex flex-1 overflow-hidden">
        <aside className="flex w-[300px] shrink-0 flex-col border-r border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 px-4 py-3">
            <h2 className="text-xs font-semibold">Capas climáticas</h2>
            <p className="font-mono text-[11px] text-slate-500">Clic en una capa para cargarla</p>
          </div>

          <LayerTree activeKey={activeKey} onLoadLayer={cargarCapa} />

          <div className="shrink-0 border-t border-slate-800 px-4 py-3">
            <div className="mb-2 font-mono text-[9px] font-bold uppercase tracking-widest text-slate-700">Capa activa</div>
            <div className="mb-2 rounded-lg border border-sky-400/20 bg-sky-400/5 px-3 py-2 font-mono text-[11px] leading-6">
              {stats ? (
                <>
                  <div className="font-medium text-sky-400">{stats.v} · {CONFIG.HOR_LABELS[stats.h]} · {CONFIG.ESC_LABELS[stats.e]}</div>
                  <hr className="my-1 border-slate-800" />
                  <div className="text-slate-500">
                    {CONFIG.VAR_LABELS[stats.v]}<br />
                    Horizonte: {CONFIG.HOR_LABELS[stats.h]}<br />
                    Escenario: {CONFIG.ESC_LABELS[stats.e]}<br />
                    Vista: {tipoLabel}
                  </div>
                </>
              ) : <div className="text-slate-500">Ninguna capa seleccionada</div>}
            </div>

            {stats && (
              <div className="mb-3 font-mono text-[11px]">
                <div className="flex justify-between"><span className="text-slate-600">Mín</span><span>{stats.vmin.toFixed(2)} {unit}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Máx</span><span>{stats.vmax.toFixed(2)} {unit}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Media</span><span className="font-semibold text-sky-400">{stats.vmean.toFixed(2)} {unit}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Desv. típica</span><span>{stats.vsd.toFixed(2)} {unit}</span></div>
              </div>
            )}

            <div className="mb-3 flex items-center gap-2">
              <label className="whitespace-nowrap font-mono text-[9px] font-bold uppercase tracking-widest text-slate-700">Opacidad</label>
              <input className="flex-1 accent-sky-400" type="range" min="0" max="1" value={opacity} step="0.05" onChange={e => setOpacity(parseFloat(e.target.value))} />
              <div className="w-8 text-right font-mono text-[11px] text-sky-400">{Math.round(opacity * 100)}%</div>
            </div>

            <div className="mb-2 font-mono text-[9px] font-bold uppercase tracking-widest text-slate-700">Provincia</div>
            <select
              className="w-full rounded-md border border-slate-800 bg-slate-900 p-1.5 font-mono text-xs text-slate-200"
              value={selectedProvince}
              onChange={e => setSelectedProvince(e.target.value)}
            >
              <option value="">Todas</option>
              {provinces?.features?.map(f => <option key={f.properties.name} value={f.properties.name}>{f.properties.name}</option>)}
            </select>
          </div>
        </aside>

        <div className="relative flex-1">
          <MapContainer center={CONFIG.MAP_CENTER} zoom={CONFIG.MAP_ZOOM} className="h-full w-full">
            <TileLayer
              attribution="© OpenStreetMap © CARTO"
              subdomains="abcd"
              maxZoom={19}
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />

            {layerData && (
              <>
                <ImageOverlay url={layerData.imageUrl} bounds={layerData.bounds} opacity={opacity} />
                <FitToBounds bounds={layerData.bounds} />
              </>
            )}

            {provinceFeature && (
              <GeoJSON
                key={selectedProvince}
                data={provinceFeature}
                style={{ color: "#38bdf8", weight: 2, fillOpacity: 0.05 }}
                eventHandlers={{
                  add: e => e.target._map.flyToBounds(e.target.getBounds(), { padding: [20, 20], maxZoom: 9, duration: 0.5 }),
                }}
              />
            )}
            <FlyToProvince provinceLayer={provinceFeature} />
            <MapClickReader layerData={layerData} activeKey={activeKey} />
            <Coordinates />
          </MapContainer>

          {progress > 0 && (
            <div className="absolute left-0 right-0 top-0 z-[9999] h-[3px] bg-transparent">
              <div className="h-full bg-sky-400 shadow-[0_0_8px_#38bdf8] transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}

          {loading && (
            <div className="absolute inset-0 z-[9998] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-800 border-t-sky-400" />
                <p className="font-mono text-xs text-slate-500">Cargando raster...</p>
              </div>
            </div>
          )}

          {stats && layerData && (
            <div className="absolute bottom-8 left-4 z-[900] min-w-[150px] rounded-lg border border-slate-800 bg-slate-950/85 p-3 font-mono text-[10px] text-slate-500">
              <div className="mb-2 text-[11px] font-semibold text-slate-200">{stats.v} · {tipoLabel}</div>
              <div
                className="my-1 h-2.5 rounded"
                style={{ background: `linear-gradient(to right, ${layerData.palette.join(", ")})` }}
              />
              <div className="flex justify-between">
                <span>{stats.vmin.toFixed(1)} {unit}</span>
                <span>{stats.vmax.toFixed(1)} {unit}</span>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
