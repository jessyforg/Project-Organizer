"""Draws the ProjectForge icon: four rounded "heat" bars rising on a graphite tile.

Pure Python (zlib + struct) so no image library is needed. Renders at 4x and box-downsamples
for smooth edges. Usage: python make_icon.py <output.png> <size>
"""
import struct
import sys
import zlib

out, size = sys.argv[1], int(sys.argv[2])
S = 4
W = size * S

BG = (29, 34, 41)          # graphite #1d2229
BARS = [
    (147, 174, 203),       # cool steel
    (226, 195, 90),        # straw
    (240, 160, 96),        # orange heat
    (240, 122, 112),       # cherry red
]


def inside_round_rect(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


tile_r = W * 0.22
bar_w = W * 0.12
gap = W * 0.055
total = 4 * bar_w + 3 * gap
left = (W - total) / 2
base = W * 0.78
heights = [0.24, 0.36, 0.48, 0.60]

shapes = []
for i, (h, color) in enumerate(zip(heights, BARS)):
    x0 = left + i * (bar_w + gap)
    shapes.append((x0, base - W * h, x0 + bar_w, base, bar_w * 0.3, color))

big = bytearray(W * W * 4)
for y in range(W):
    for x in range(W):
        idx = (y * W + x) * 4
        if not inside_round_rect(x + 0.5, y + 0.5, 0, 0, W - 1, W - 1, tile_r):
            continue
        rgb = BG
        for (x0, y0, x1, y1, r, color) in shapes:
            if inside_round_rect(x + 0.5, y + 0.5, x0, y0, x1, y1, r):
                rgb = color
                break
        big[idx:idx + 4] = bytes((*rgb, 255))

# Box downsample with premultiplied alpha.
rows = []
for y in range(size):
    row = bytearray([0])  # PNG filter type 0
    for x in range(size):
        r = g = b = a = 0
        for dy in range(S):
            for dx in range(S):
                i = ((y * S + dy) * W + (x * S + dx)) * 4
                pa = big[i + 3]
                r += big[i] * pa
                g += big[i + 1] * pa
                b += big[i + 2] * pa
                a += pa
        n = S * S
        if a:
            row += bytes((r // a, g // a, b // a, a // n))
        else:
            row += bytes((0, 0, 0, 0))
    rows.append(bytes(row))


def chunk(kind, data):
    body = kind + data
    return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)


png = b'\x89PNG\r\n\x1a\n'
png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
png += chunk(b'IDAT', zlib.compress(b''.join(rows), 9))
png += chunk(b'IEND', b'')
with open(out, 'wb') as f:
    f.write(png)
print(out, size)
