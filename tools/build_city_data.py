"""
City Pulse - يولّد data.json لثلاث مدن: الرياض وجدة والدمام
الفترات: 2013 · 2015 · 2020 · 2025 (نفس فترات شاشة Compare)

المؤشرات الثلاثة:
  - heat         -> lst_c     حرارة سطح الأرض بالدرجة المئوية (Landsat thermal)
  - vegetation   -> ndvi      الغطاء النباتي من -1 إلى 1، كل ما زاد = أخضر أكثر (Landsat)
  - urbanization -> built_pct نسبة المساحة المبنية % (GHSL: JRC/GHSL/P2023A/GHS_BUILT_S)

التشغيل (على جهازك، مرة وحدة):
  pip install earthengine-api requests
  earthengine authenticate
  (غيّر YOUR_PROJECT_ID بالأسفل)
  python build_city_data.py
المخرجات (داخل مجلد out/):
  out/data.json                        -> انقله إلى مشروع التطبيق باسم data/city-data.json  (الشات يقرأ منه)
  out/maps/*.png + out/maps/manifest.json -> انسخ المجلد maps كامل إلى public/maps في المشروع (التطبيق يعرض الخرائط في الشات)
  out/geotiff/*.tif                    -> خرائط جغرافية حقيقية للتحليل والتكبير (QGIS وغيره)
  out/*.csv                            -> أرقام الأحياء لكل سنة والتغيّر (تفتح في Excel)
"""
import csv
import json
import os
import time

import ee
import requests

ee.Initialize(project="citypulse-513320")

YEARS = [2013, 2015, 2020, 2025]
EPOCHS = {"2013": "Baseline", "2015": "Expansion", "2020": "Green Riyadh", "2025": "Present"}
WINDOW = ("04-15", "06-30")  # نفس الموسم في كل السنوات عشان المقارنة عادلة

# ------------------------------------------------------------------
# المدن والأحياء. الاسم الإنجليزي ثم العربي. عدّل القوائم براحتك.
# الحدود والإحداثيات تُجلب تلقائياً من OpenStreetMap، ويطبع السكربت ماذا وجد لكل حي عشان تراجعه.
# viewbox = (غرب, شمال, شرق, جنوب) لتقييد البحث داخل المدينة. region = مستطيل لاختيار صور Landsat.
# ------------------------------------------------------------------
CITIES = {
    "Riyadh": {
        "ar": "الرياض",
        "viewbox": "46.2,25.2,47.2,24.3",
        "region": [46.40, 24.50, 46.90, 25.10],
        "neighborhoods": {
            "Al Malqa": "الملقا", "Hittin": "حطين", "Al Narjis": "النرجس", "Al Yasmin": "الياسمين",
            "Al Aqiq": "العقيق", "Al Nafal": "النفل", "Al Muruj": "المروج", "Al Nakheel": "النخيل",
        },
    },
    "Jeddah": {
        "ar": "جدة",
        "viewbox": "39.0,21.9,39.4,21.2",
        "region": [39.05, 21.30, 39.35, 21.80],
        "neighborhoods": {
            "Al Rawdah": "الروضة", "Al Hamra": "الحمراء", "Al Salamah": "السلامة", "Al Zahraa": "الزهراء",
            "Obhur Al Shamaliyah": "أبحر الشمالية", "Al Safa": "الصفا", "Al Naeem": "النعيم", "Al Shati": "الشاطئ",
        },
    },
    "Dammam": {
        "ar": "الدمام",
        "viewbox": "49.9,26.65,50.35,26.15",
        "region": [49.95, 26.25, 50.30, 26.55],
        "neighborhoods": {
            "Al Faisaliyah": "الفيصلية", "Al Shati": "الشاطئ", "Al Adamah": "العدامة", "Al Anoud": "العنود",
            "Al Mazruiyah": "المزروعية", "Uhud": "أحد", "Al Jalawiyah": "الجلوية", "Al Badiyah": "البادية",
        },
    },
}

# لو حي ما انوجد أو انوجد غلط، حدّد مركزه يدوياً: ("City", "Neighborhood"): {"lat": .., "lon": ..}
OVERRIDES = {
    # ("Riyadh", "Al Nafal"): {"lat": 24.78011, "lon": 46.67370},
}
RADIUS_M = 1500   # دائرة حول المركز لو ما لقينا حدود الحي
MAX_BOX_DEG = 0.1  # أكبر حجم مقبول لحدود الحي (~11 كم)، غير كذا نعتبره تطابق خاطئ

# Landsat 8 بدأ بياناته أبريل 2013، فكل السنوات بنفس الحساس (والـ 2025 معه Landsat 9)
SENSORS = {
    2013: ["LANDSAT/LC08/C02/T1_L2"],
    2015: ["LANDSAT/LC08/C02/T1_L2"],
    2020: ["LANDSAT/LC08/C02/T1_L2"],
    2025: ["LANDSAT/LC08/C02/T1_L2", "LANDSAT/LC09/C02/T1_L2"],
}
BANDS = {"red": "SR_B4", "nir": "SR_B5", "thermal": "ST_B10"}

# ---------------- المخرجات ----------------
OUT_DIR = "out"
EXPORT_MAPS = True       # صور PNG للخرائط (حقيقي، نفس الفترات) للعرض في الشات
EXPORT_GEOTIFF = True    # خرائط GeoTIFF للتحليل (أبطأ وأكبر حجماً، اجعلها False لو ما تحتاجها)
IMG_PX = 1024            # أكبر بُعد لصورة PNG
GEOTIFF_SCALE = 60       # دقة GeoTIFF بالمتر
NDVI_PALETTE = ["#f5f5f0", "#d9ef8b", "#a6d96a", "#66bd63", "#1a9850", "#006837"]
LST_PALETTE = ["#313695", "#4575b4", "#74add1", "#abd9e9", "#ffffbf", "#fdae61", "#f46d43", "#d73027", "#a50026"]

# حدود الأسهم (↑↑ ↑ → ↓ ↓↓): (فرق "ثابت", فرق "قوي"). أرقام مبدئية تقدر تعدّلها
THRESHOLDS = {"heat": (1.0, 3.0), "vegetation": (0.02, 0.06), "urbanization": (3.0, 10.0)}


# ---------------- OpenStreetMap: حدود الأحياء ----------------
def pick_geometry(res):
    """يختار الحدود من نتيجة Nominatim: مضلّع الحي لو معقول الحجم، وإلا نقطة المركز."""
    lat, lon = float(res["lat"]), float(res["lon"])
    south, north, west, east = [float(x) for x in res["boundingbox"]]
    small = (north - south) <= MAX_BOX_DEG and (east - west) <= MAX_BOX_DEG
    gj = res.get("geojson") or {}
    if small and gj.get("type") in ("Polygon", "MultiPolygon"):
        return "OSM boundary", gj, lat, lon
    return f"circle {RADIUS_M} m around OSM point", None, lat, lon


def lookup(name_en, name_ar, city_en, city_ar, viewbox):
    for q in (f"{name_ar}, {city_ar}", f"{name_en}, {city_en}"):
        resp = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": q, "format": "jsonv2", "polygon_geojson": 1, "limit": 1,
                    "viewbox": viewbox, "bounded": 1, "accept-language": "en"},
            headers={"User-Agent": "city-pulse-student-project"},
            timeout=30,
        )
        time.sleep(1.1)  # سياسة Nominatim: طلب واحد بالثانية
        data = resp.json()
        if data:
            return data[0]
    return None


def build_features(city, cfg):
    feats, info = [], {}
    for name, name_ar in cfg["neighborhoods"].items():
        key = (city, name)
        if key in OVERRIDES:
            lat, lon = OVERRIDES[key]["lat"], OVERRIDES[key]["lon"]
            basis, gj, found = f"circle {RADIUS_M} m around manual point", None, "manual override"
        else:
            res = lookup(name, name_ar, city, cfg["ar"], cfg["viewbox"])
            if res is None:
                print(f"!! {city} / {name}: ما انوجد. حدّد مركزه في OVERRIDES وأعد التشغيل.")
                continue
            basis, gj, lat, lon = pick_geometry(res)
            found = res.get("display_name", "")
        geom = ee.Geometry(gj, None, False) if gj else ee.Geometry.Point([lon, lat]).buffer(RADIUS_M)
        feats.append(ee.Feature(geom, {"name": name}))
        info[name] = {"name_ar": name_ar, "lat": round(lat, 5), "lon": round(lon, 5),
                      "area_basis": basis, "found_as": found}
        print(f"{city} / {name}: {basis} | {found}")
    return ee.FeatureCollection(feats), info


# ---------------- Landsat: الحرارة والنباتات ----------------
def mask_clouds(img):
    qa = img.select("QA_PIXEL")
    bad = (qa.bitwiseAnd(1 << 3).neq(0)      # سحاب
           .Or(qa.bitwiseAnd(1 << 4).neq(0))  # ظل سحاب
           .Or(qa.bitwiseAnd(1 << 7).neq(0)))  # ماء (مهم لجدة والدمام: نقيس اليابسة فقط)
    return img.updateMask(bad.Not())


def prep(img):
    red = img.select(BANDS["red"]).multiply(0.0000275).add(-0.2)
    nir = img.select(BANDS["nir"]).multiply(0.0000275).add(-0.2)
    ndvi = nir.subtract(red).divide(nir.add(red)).rename("ndvi")
    lst = img.select(BANDS["thermal"]).multiply(0.00341802).add(149.0).subtract(273.15).rename("lst_c")
    return ee.Image.cat([ndvi, lst])


def composite(year, region):
    start, end = f"{year}-{WINDOW[0]}", f"{year}-{WINDOW[1]}"
    col = None
    for name in SENSORS[year]:
        c = (ee.ImageCollection(name).filterDate(start, end).filterBounds(region)
             .map(mask_clouds).map(prep))
        col = c if col is None else col.merge(c)
    return col.median(), col.size().getInfo()


def mask_cloud_only(img):
    qa = img.select("QA_PIXEL")
    bad = qa.bitwiseAnd(1 << 3).neq(0).Or(qa.bitwiseAnd(1 << 4).neq(0))
    return img.updateMask(bad.Not())


def optical_image(year, region):
    """صورة ملوّنة طبيعية (RGB) لسنة معيّنة: وسيط صور الموسم بدون سحاب. البحر يبقى ظاهر."""
    start, end = f"{year}-{WINDOW[0]}", f"{year}-{WINDOW[1]}"
    col = None
    for name in SENSORS[year]:
        c = (ee.ImageCollection(name).filterDate(start, end).filterBounds(region)
             .map(mask_cloud_only).select(["SR_B4", "SR_B3", "SR_B2"]))
        col = c if col is None else col.merge(c)
    img = col.median().multiply(0.0000275).add(-0.2)
    return img.visualize(bands=["SR_B4", "SR_B3", "SR_B2"], min=0.02, max=0.32, gamma=1.25)


def slug(text):
    return text.lower().replace(" ", "_")


def fetch(url, path):
    resp = requests.get(url, timeout=300)
    resp.raise_for_status()
    with open(path, "wb") as f:
        f.write(resp.content)


def export_city_maps(city, cfg, imgs):
    """يصدّر لكل سنة: PNG (طبيعي، نباتات، حرارة) + GeoTIFF. يرجع قائمة الصور للتطبيق (manifest)."""
    region = ee.Geometry.Rectangle(cfg["region"])
    maps_dir, tif_dir = os.path.join(OUT_DIR, "maps"), os.path.join(OUT_DIR, "geotiff")
    os.makedirs(maps_dir, exist_ok=True)
    os.makedirs(tif_dir, exist_ok=True)
    layers = {"truecolor": {}, "ndvi": {}, "lst": {}}

    for year in YEARS:
        rgb = optical_image(year, region)
        ind = imgs[year]
        visuals = {
            "truecolor": rgb,
            "ndvi": ind.select("ndvi").visualize(min=0, max=0.5, palette=NDVI_PALETTE),
            "lst": ind.select("lst_c").visualize(min=25, max=55, palette=LST_PALETTE),
        }
        for layer, vis in visuals.items():
            name = f"{slug(city)}_{year}_{layer}.png"
            try:
                url = vis.getThumbURL({"region": region, "dimensions": IMG_PX, "format": "png"})
                fetch(url, os.path.join(maps_dir, name))
                layers[layer][str(year)] = name
                print("  map:", name)
            except Exception as e:  # نكمّل حتى لو ملف فشل
                print("  !! فشل", name, "->", str(e)[:140])
        if EXPORT_GEOTIFF:
            for tag, image in (("truecolor", rgb), ("indicators", ind.select(["ndvi", "lst_c"]).toFloat())):
                name = f"{slug(city)}_{year}_{tag}.tif"
                try:
                    url = image.getDownloadURL({"region": region, "scale": GEOTIFF_SCALE, "format": "GEO_TIFF"})
                    fetch(url, os.path.join(tif_dir, name))
                    print("  geotiff:", name)
                except Exception as e:
                    print("  !! فشل", name, "->", str(e)[:140])

    return {"name_ar": cfg["ar"], "region": cfg["region"], "layers": {k: v for k, v in layers.items() if v}}


def write_csvs(out):
    """ملفات CSV تفتح في Excel (UTF-8 مع BOM عشان العربي يظهر صح)."""
    os.makedirs(OUT_DIR, exist_ok=True)
    last = YEARS[-1]
    with open(os.path.join(OUT_DIR, "neighborhoods_by_year.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["city", "neighborhood", "neighborhood_ar", "year", "epoch", "ndvi", "lst_c", "built_pct", "area_basis"])
        for c in out["cities"]:
            for n in c["neighborhoods"]:
                for y in YEARS:
                    v = n[str(y)]
                    w.writerow([c["name"], n["name"], n["name_ar"], y, EPOCHS[str(y)], v["ndvi"], v["lst_c"], v["built_pct"], n["area_basis"]])
            for y in YEARS:
                v = c["summary"][str(y)]
                w.writerow([c["name"], "(average of listed neighborhoods)", "", y, EPOCHS[str(y)], v["ndvi"], v["lst_c"], v["built_pct"], ""])
    with open(os.path.join(OUT_DIR, f"changes_vs_{last}.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["city", "neighborhood", "neighborhood_ar", "from_year", "to_year", "lst_c_change", "ndvi_change",
                    "built_pct_change", "heat_trend", "vegetation_trend", "urbanization_trend"])
        for c in out["cities"]:
            rows = [(n["name"], n["name_ar"], n[f"vs_{last}"]) for n in c["neighborhoods"]]
            rows.append(("(average of listed neighborhoods)", "", c["summary"][f"vs_{last}"]))
            for name, name_ar, comps in rows:
                for y, comp in comps.items():
                    ch, tr = comp["change"], comp["trend"]
                    w.writerow([c["name"], name, name_ar, y, last, ch["lst_c"], ch["ndvi"], ch["built_pct"],
                                tr["heat"], tr["vegetation"], tr["urbanization"]])


# ---------------- GHSL: العمران ----------------
_epoch_cache = {}


def ghsl_means(city, fc, epoch):
    """متوسط المساحة المبنية (م² لكل خلية 100م×100م) لكل حي في سنة GHSL معيّنة."""
    key = (city, epoch)
    if key not in _epoch_cache:
        feats = (ee.Image(f"JRC/GHSL/P2023A/GHS_BUILT_S/{epoch}").select("built_surface")
                 .reduceRegions(collection=fc, reducer=ee.Reducer.mean(), scale=100).getInfo()["features"])
        _epoch_cache[key] = {f["properties"]["name"]: f["properties"].get("mean") for f in feats}
    return _epoch_cache[key]


def built_for_year(city, fc, year):
    """GHSL كل 5 سنوات فقط (2010, 2015, ...). سنة مثل 2013 تُحسب بالاستيفاء الخطي بين الفترتين."""
    lo = year // 5 * 5
    if lo == year:
        return ghsl_means(city, fc, year)
    hi, w = lo + 5, (year - lo) / 5
    a, b = ghsl_means(city, fc, lo), ghsl_means(city, fc, hi)
    return {k: (None if a[k] is None or b[k] is None else a[k] + (b[k] - a[k]) * w) for k in a}


# ---------------- مساعدات الحساب ----------------
def r(v, n):
    return None if v is None else round(v, n)


def label(delta, flat, strong):
    if delta is None:
        return None
    a = abs(delta)
    if a < flat:
        return "flat"
    return ("strong_" if a >= strong else "") + ("up" if delta > 0 else "down")


def diff(a, b, key, nd):
    return None if a[key] is None or b[key] is None else round(b[key] - a[key], nd)


def compare(a, b):
    """التغيّر من سنة المقارنة (a) إلى السنة الأخيرة (b) + اتجاه كل مؤشر."""
    change = {"lst_c": diff(a, b, "lst_c", 1), "ndvi": diff(a, b, "ndvi", 3), "built_pct": diff(a, b, "built_pct", 1)}
    trend = {
        "heat": label(change["lst_c"], *THRESHOLDS["heat"]),
        "vegetation": label(change["ndvi"], *THRESHOLDS["vegetation"]),
        "urbanization": label(change["built_pct"], *THRESHOLDS["urbanization"]),
    }
    return {"change": change, "trend": trend}


def average(vals):
    """متوسط الأحياء لسنة واحدة (يتجاهل القيم الفارغة)."""
    out = {}
    for k, nd in (("ndvi", 3), ("lst_c", 1), ("built_pct", 1)):
        xs = [v[k] for v in vals if v[k] is not None]
        out[k] = round(sum(xs) / len(xs), nd) if xs else None
    return out


def process_city(city, cfg):
    fc, info = build_features(city, cfg)
    region = ee.Geometry.Rectangle(cfg["region"])
    values = {k: {} for k in info}
    counts = {}
    imgs = {}

    for year in YEARS:
        img, count = composite(year, region)
        counts[str(year)] = count
        imgs[year] = img
        print(f"{city} {year}: {count} Landsat images")
        if count == 0:
            print("  تحذير: ما فيه صور لهذي السنة، النتائج بتكون فاضية")
        landsat = img.reduceRegions(collection=fc, reducer=ee.Reducer.mean(), scale=30).getInfo()["features"]
        built = built_for_year(city, fc, year)
        for f in landsat:
            p = f["properties"]
            b = built.get(p["name"])  # م² مبنية لكل خلية 10,000 م²
            values[p["name"]][year] = {
                "ndvi": r(p.get("ndvi"), 3),
                "lst_c": r(p.get("lst_c"), 1),
                "built_pct": r(None if b is None else b / 100.0, 1),
            }

    last = YEARS[-1]
    rows = []
    for name, n in info.items():
        row = {"name": name, "name_ar": n["name_ar"], "lat": n["lat"], "lon": n["lon"],
               "area_basis": n["area_basis"], "found_as": n["found_as"]}
        for y in YEARS:
            row[str(y)] = values[name][y]
        row[f"vs_{last}"] = {str(y): compare(values[name][y], values[name][last]) for y in YEARS[:-1]}
        rows.append(row)

    # ملخص المدينة = متوسط الأحياء المدرجة فقط (مو قياس للمدينة كلها)
    summary = {str(y): average([values[n][y] for n in values]) for y in YEARS}
    summary[f"vs_{last}"] = {str(y): compare(summary[str(y)], summary[str(last)]) for y in YEARS[:-1]}
    return {"name": city, "name_ar": cfg["ar"], "summary_basis": "average of the listed neighborhoods",
            "summary": summary, "neighborhoods": rows}, counts, imgs


def main():
    out = {
        "meta": {
            "years": YEARS,
            "epochs": EPOCHS,
            "season": "Apr 15 - Jun 30",
            "indicators": {
                "heat": "lst_c = land surface temperature in degrees Celsius",
                "vegetation": "ndvi = vegetation index, higher is greener",
                "urbanization": "built_pct = percent of area that is built-up",
            },
            "sources": {
                "heat_vegetation": "Landsat 8 (2013, 2015, 2020) and Landsat 8/9 (2025), Collection 2 Level-2",
                "urbanization": "JRC GHSL GHS-BUILT-S R2023A",
            },
            "trend_thresholds": THRESHOLDS,
            "notes": [
                "Each value is the mean over the neighborhood area from OpenStreetMap when a boundary was found, otherwise over a 1.5 km circle around its center (see area_basis). These are not official municipal boundaries.",
                "City summaries are the average of the listed neighborhoods only, not a measurement of the whole city.",
                "Water pixels are masked, so coastal values (Jeddah, Dammam) describe land only.",
                "GHSL built-up data comes in 5-year steps, so 2013 is interpolated between the 2010 and 2015 epochs and 2025 is an extrapolated estimate, not a direct observation.",
                "Landsat 8 started collecting in April 2013, so 2013 is based on a short season with fewer images.",
                "The app's map comparison shows Landsat 8 (2013) and Sentinel-2 (2025) imagery, while all numbers here are computed from Landsat 8/9 so that the same sensor family is used in every year.",
                "Trends show association in the data, not proof of cause.",
            ],
            "landsat_image_counts": {},
        },
        "cities": [],
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = {"epochs": EPOCHS, "cities": {}}
    for city, cfg in CITIES.items():
        data, counts, imgs = process_city(city, cfg)
        out["cities"].append(data)
        out["meta"]["landsat_image_counts"][city] = counts
        print("done:", city)
        if EXPORT_MAPS:
            entry = export_city_maps(city, cfg, imgs)
            if entry["layers"]:
                manifest["cities"][city] = entry

    with open(os.path.join(OUT_DIR, "data.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    write_csvs(out)
    if manifest["cities"]:
        os.makedirs(os.path.join(OUT_DIR, "maps"), exist_ok=True)
        with open(os.path.join(OUT_DIR, "maps", "manifest.json"), "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
    print("\nتم. المخرجات في مجلد out/ :")
    print("  out/data.json            -> data/city-data.json")
    print("  out/maps/                -> انسخ المجلد كامل إلى public/maps")
    print("  out/geotiff/ و out/*.csv -> للتحليل (QGIS / Excel)")


if __name__ == "__main__":
    main()
