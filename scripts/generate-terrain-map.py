#!/usr/bin/env python3
"""
Generate terrain base map for wdttgukji (Three Kingdoms strategy game).

Layer stack:
  1. Google Maps terrain tiles (cartopy handles Mercator→PlateCarree reprojection)
  2. DEM hillshade overlay (SRTM elevation data → relief depth)
  3. Cartopy vector features (rivers, coastlines, lakes)
  4. Three Kingdoms era region labels (关中, 荆州, 益州 etc.)
  5. Post-processing (darken, warm, vignette for game aesthetic)

Output: 3200x1800 JPEG at /Users/pkc/wdttgukji/public/assets/maps/china-terrain.jpg
"""

import numpy as np
import math
import urllib.request
import io
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patheffects
import matplotlib.colors as mcolors
from matplotlib.colors import LightSource
import cartopy.crs as ccrs
import cartopy.feature as cfeature
from cartopy.io.img_tiles import GoogleTiles
from scipy.ndimage import gaussian_filter
from PIL import Image, ImageEnhance

# ── Game bounds (equirectangular / plate carree) ──
LON_MIN, LON_MAX = 96.76, 125.59
LAT_MIN, LAT_MAX = 20.58, 43.83

# Output
WIDTH, HEIGHT = 3200, 1800
DPI = 200
CJK_FONT = 'Songti SC'

# ── Google Maps terrain tiles (no labels) ──
class GoogleTerrain(GoogleTiles):
    """Google terrain tiles (full colored terrain view)."""
    def _image_url(self, tile):
        x, y, z = tile
        return f'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}'

# ── DEM tiles (AWS Terrain Tiles) ──
DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/geotiff/{z}/{x}/{y}.tif'
DEM_ZOOM = 6
DEM_CACHE = '/tmp/wdttgukji-dem-tiles'


def deg2tile(lat, lon, zoom):
    lat_rad = math.radians(lat)
    n = 2 ** zoom
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.log(math.tan(lat_rad) + 1.0 / math.cos(lat_rad)) / math.pi) / 2.0 * n)
    return x, y


def tile2deg(x, y, zoom):
    n = 2 ** zoom
    lon = x / n * 360.0 - 180.0
    lat = math.degrees(math.atan(math.sinh(math.pi * (1.0 - 2.0 * y / n))))
    return lat, lon


def download_dem_tile(z, x, y):
    os.makedirs(DEM_CACHE, exist_ok=True)
    cache_path = os.path.join(DEM_CACHE, f'{z}_{x}_{y}.tif')
    if os.path.exists(cache_path):
        try:
            return (x, y, np.array(Image.open(cache_path), dtype=np.float32))
        except Exception:
            pass
    url = DEM_URL.format(z=z, x=x, y=y)
    for attempt in range(3):
        try:
            data = urllib.request.urlopen(url, timeout=30).read()
            with open(cache_path, 'wb') as f:
                f.write(data)
            return (x, y, np.array(Image.open(io.BytesIO(data)), dtype=np.float32))
        except Exception as e:
            if attempt == 2:
                print(f'  WARN: DEM tile {z}/{x}/{y} failed: {e}')
                return (x, y, np.zeros((512, 512), dtype=np.float32))


def fetch_dem():
    """Download SRTM DEM tiles and crop to game bounds."""
    print("[1/5] Fetching DEM tiles...")
    x_min, y_min = deg2tile(LAT_MAX, LON_MIN, DEM_ZOOM)
    x_max, y_max = deg2tile(LAT_MIN, LON_MAX, DEM_ZOOM)
    nx, ny = x_max - x_min + 1, y_max - y_min + 1
    total = nx * ny
    print(f"  {nx}x{ny} = {total} tiles at zoom {DEM_ZOOM}")

    mosaic = np.zeros((ny * 512, nx * 512), dtype=np.float32)
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(download_dem_tile, DEM_ZOOM, tx, ty): (tx, ty)
                   for ty in range(y_min, y_max + 1)
                   for tx in range(x_min, x_max + 1)}
        done = 0
        for f in as_completed(futures):
            tx, ty = futures[f]
            _, _, arr = f.result()
            mosaic[(ty-y_min)*512:(ty-y_min+1)*512, (tx-x_min)*512:(tx-x_min+1)*512] = arr
            done += 1
            if done % 12 == 0 or done == total:
                print(f"  {done}/{total}")

    # Crop to game bounds (Mercator→linear lat)
    n = 2 ** DEM_ZOOM
    tile_ys = np.linspace(y_min, y_max + 1, mosaic.shape[0] + 1)
    lat_centers = np.degrees(np.arctan(np.sinh(np.pi * (1.0 - 2.0 * 0.5 * (tile_ys[:-1] + tile_ys[1:]) / n))))
    lon_centers = np.linspace(x_min, x_max + 1, mosaic.shape[1] + 1)
    lon_centers = 0.5 * (lon_centers[:-1] + lon_centers[1:]) / n * 360.0 - 180.0

    r0 = np.searchsorted(-lat_centers, -LAT_MAX)
    r1 = np.searchsorted(-lat_centers, -LAT_MIN)
    c0 = np.searchsorted(lon_centers, LON_MIN)
    c1 = np.searchsorted(lon_centers, LON_MAX)
    cropped = mosaic[r0:r1, c0:c1]
    print(f"  Cropped: {cropped.shape[1]}x{cropped.shape[0]}, elev {cropped.min():.0f}~{cropped.max():.0f}m")
    return cropped


def compute_hillshade(dem):
    """Dual-light hillshade from DEM. Returns 0-1 array."""
    smooth = gaussian_filter(dem.astype(np.float64), sigma=1.0)
    dx = (LON_MAX - LON_MIN) / dem.shape[1]
    dy = (LAT_MAX - LAT_MIN) / dem.shape[0]
    hs1 = LightSource(azdeg=315, altdeg=40).hillshade(smooth, dx=dx, dy=dy, vert_exag=5)
    hs2 = LightSource(azdeg=200, altdeg=25).hillshade(smooth, dx=dx, dy=dy, vert_exag=2.5)
    return 0.70 * hs1 + 0.30 * hs2


def render(dem):
    """Render Google terrain + DEM hillshade + vector features + labels."""
    print("[2/5] Computing hillshade...")
    hillshade = compute_hillshade(dem)

    print("[3/5] Rendering Google terrain tiles + overlays...")
    fig_w, fig_h = WIDTH / DPI, HEIGHT / DPI
    fig = plt.figure(figsize=(fig_w, fig_h), dpi=DPI)
    ax = fig.add_axes([0, 0, 1, 1], projection=ccrs.PlateCarree())
    ax.set_extent([LON_MIN, LON_MAX, LAT_MIN, LAT_MAX], crs=ccrs.PlateCarree())

    # ── Layer 1: Google terrain tiles (no labels) ──
    tiler = GoogleTerrain()
    ax.add_image(tiler, 7)  # zoom 7 — good balance of detail vs tile count

    # ── Layer 2: DEM hillshade overlay (adds relief depth) ──
    # Dark overlay: emphasize shadows, brighten highlights
    hs_rgba = np.zeros((*hillshade.shape, 4))
    # Shadows → darken (black, alpha based on shadow depth)
    shadow_mask = hillshade < 0.45
    hs_rgba[shadow_mask, 3] = (0.45 - hillshade[shadow_mask]) * 0.6
    # Highlights → lighten (white, alpha based on brightness)
    bright_mask = hillshade > 0.55
    hs_rgba[bright_mask, :3] = 1.0
    hs_rgba[bright_mask, 3] = (hillshade[bright_mask] - 0.55) * 0.25

    ax.imshow(
        hs_rgba,
        origin='upper',
        extent=[LON_MIN, LON_MAX, LAT_MIN, LAT_MAX],
        transform=ccrs.PlateCarree(),
        interpolation='bilinear',
        aspect='auto',
        zorder=2
    )

    # ── Layer 3: Vector features ──
    # Rivers (wider, bluer)
    ax.add_feature(cfeature.RIVERS.with_scale('50m'),
                   edgecolor='#2a5878', linewidth=2.4, facecolor='none', alpha=0.4, zorder=3)
    ax.add_feature(cfeature.RIVERS.with_scale('50m'),
                   edgecolor='#4a88a8', linewidth=1.2, facecolor='none', alpha=0.7, zorder=3.5)

    # Lakes
    ax.add_feature(cfeature.LAKES.with_scale('50m'),
                   facecolor='#1e3850', edgecolor='#2a4050', linewidth=0.4, zorder=3)

    # Coastline highlight
    ax.add_feature(cfeature.COASTLINE.with_scale('50m'),
                   edgecolor='#5a8a6e', linewidth=1.2, zorder=4, alpha=0.5)

    # ── Layer 4: Region labels (三国 era) ──
    region_labels = [
        (108.0, 34.5, '关中',  16, 0.22),
        (113.5, 35.8, '中原',  16, 0.22),
        (115.5, 39.5, '河北',  15, 0.20),
        (112.0, 30.0, '荆州',  15, 0.20),
        (104.0, 30.0, '益州',  15, 0.20),
        (119.5, 31.0, '扬州',  14, 0.18),
        (101.5, 36.5, '凉州',  14, 0.18),
        (123.0, 41.5, '辽东',  13, 0.16),
        (108.0, 23.5, '交州',  13, 0.15),
    ]
    geo_labels = [
        (110.0, 33.2, '秦 岭',  11, 0.18, '#c8b890'),
        (113.8, 38.5, '太行山', 11, 0.16, '#c8b890'),
        (112.5, 34.8, '黄 河',  10, 0.24, '#7ab8e0'),
        (114.5, 29.5, '长 江',  10, 0.24, '#7ab8e0'),
        (121.5, 35.5, '黄 海',  12, 0.18, '#5a96b8'),
        (120.0, 24.5, '东 海',  12, 0.16, '#5a96b8'),
    ]

    stroke = lambda lw, a: [matplotlib.patheffects.withStroke(linewidth=lw, foreground='#08080a', alpha=a)]

    for lon, lat, text, fs, alpha in region_labels:
        ax.text(lon, lat, text, transform=ccrs.PlateCarree(),
                fontsize=fs, fontweight='bold', color='#d0c8a0',
                alpha=alpha, ha='center', va='center',
                fontfamily=CJK_FONT, zorder=6,
                path_effects=stroke(4, alpha * 0.6))

    for lon, lat, text, fs, alpha, color in geo_labels:
        ax.text(lon, lat, text, transform=ccrs.PlateCarree(),
                fontsize=fs, fontweight='bold', color=color,
                alpha=alpha, ha='center', va='center',
                fontfamily=CJK_FONT, fontstyle='italic', zorder=6,
                path_effects=stroke(3, alpha * 0.5))

    ax.set_axis_off()
    ax.patch.set_facecolor('#0e1a28')
    fig.patch.set_facecolor('#0e1a28')

    print("[4/5] Rendering to buffer...")
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=DPI, bbox_inches='tight', pad_inches=0,
                facecolor=fig.get_facecolor())
    plt.close(fig)
    buf.seek(0)
    return buf


def post_process(buf):
    """Dark antique war map color grading."""
    print("[5/5] Post-processing...")
    img = Image.open(buf).convert('RGB')
    img = img.resize((WIDTH, HEIGHT), Image.LANCZOS)
    arr = np.array(img, dtype=np.float32)

    # Darken for game UI (terrain still readable, UI text pops)
    arr *= 0.52

    # Warm amber shift
    arr[:, :, 0] *= 1.08  # Red warmth
    arr[:, :, 1] *= 1.02  # Green neutral
    arr[:, :, 2] *= 0.90  # Blue reduction

    # Edge vignette
    cy, cx = HEIGHT // 2, WIDTH // 2
    max_d = np.sqrt(cx**2 + cy**2)
    ys, xs = np.mgrid[0:HEIGHT, 0:WIDTH]
    dist = np.sqrt((xs - cx)**2 + (ys - cy)**2)
    vig = np.clip((dist / max_d - 0.55) * 2.0, 0, 1) ** 2.0
    arr *= (1.0 - vig[:, :, np.newaxis] * 0.30)

    arr = np.clip(arr, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr)
    img = ImageEnhance.Contrast(img).enhance(1.18)
    img = ImageEnhance.Sharpness(img).enhance(1.12)
    return img


def main():
    output_path = '/Users/pkc/wdttgukji/public/assets/maps/china-terrain.jpg'
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    dem = fetch_dem()
    buf = render(dem)
    img = post_process(buf)

    print(f"\nSaving to {output_path}...")
    img.save(output_path, 'JPEG', quality=92, optimize=True)

    # Verify
    arr = np.array(img)
    print(f"  Size: {img.size[0]}x{img.size[1]}, {os.path.getsize(output_path)/1024:.0f}KB")
    print(f"  Mean: {arr.mean():.1f}/255, Std: {arr.std():.1f}")

    preview = img.resize((800, 450), Image.LANCZOS)
    preview.save(output_path.replace('.jpg', '-preview.jpg'), 'JPEG', quality=85)
    print("Done!")


if __name__ == '__main__':
    main()
