# Tek Çekirdek, İki Shader — TSL compute ile mesh'ten mesh'e parçacık morph'u

"Tek Çekirdek, İki Shader: TSL Compute ile Mesh'ten Mesh'e Parçacık Morph'u"
makalesinin çalışan kodu.

Parçacık konumları GPU'da bir `instancedArray` (storage buffer) içinde yaşıyor.
Hedef bulutları iki mesh yüzeyinden **alan-ağırlıklı CDF örneklemesiyle** çıkıyor.
**Tek bir TSL kernel'ı** iki backend'e derleniyor:

| Backend               | Ne üretiliyor                                                       | Rastgele indeksli okuma   |
| --------------------- | ------------------------------------------------------------------- | ------------------------- |
| WebGPU                | `var<storage, read_write>` + `@compute @workgroup_size( 64, 1, 1 )` | tamponun kendisinden      |
| WebGL2 (`forceWebGL`) | vertex shader + transform feedback varying'leri                     | `texelFetch` (PBO dokusu) |

İkisinin dökümü **GPU ve tarayıcı olmadan**, Node'da alınabiliyor — bu yüzden
makalenin ana iddiaları saf vitest testleriyle çivilenmiş durumda.

Sürüm sabit (caret **yok**, bilerek): `three@0.185.1`. three minor sürümlerde node
sistemini değiştiriyor ve makale kaynak dosyalarına satır numarasıyla atıf yapıyor.
React/R3F yok, hazır parçacık/GPGPU kütüphanesi yok, **elle WGSL/GLSL yazılmıyor** —
shader'lar TSL'den üretiliyor, biz yalnızca döküyoruz.

## Kurulum

```bash
npm install
```

`--legacy-peer-deps` gerekmiyor.

## Çalıştırma

```bash
npm run dev
```

`http://localhost:5173/` — **port sabit** (`vite.config.ts` → `strictPort: true`).
Port doluysa Vite sessizce kaymak yerine hata verir; aşağıdaki ölçüm URL'leri
birebir bu adresi gösteriyor. **`file://` ile açmayın**, boş ekran verir.

### Demo kontrolleri

| Kontrol           | Değerler                                                         | Varsayılan |
| ----------------- | ---------------------------------------------------------------- | ---------- |
| Parçacık sayısı   | 100k / 200k / 500k                                               | **100k**   |
| Morph             | küre ⇄ burgu düğümü geçişini tetikler                            | küre       |
| Eş bağı           | Kapalı / Açık / **Açık (PBO'suz)**                               | Açık       |
| Çözünürlük ölçeği | 0,35 / 0,50 / 0,75 / 1,00                                        | **0,50**   |
| Dur/Devam         | —                                                                | Çalışıyor  |
| Backend           | sayfayı `?backend=webgpu` / `?backend=webgl2` ile yeniden yükler | otomatik   |

`devicePixelRatio` 2'ye kelepçeli (`src/viewport.ts`), sekme gizlenince döngü
duruyor (`visibilitychange`), HUD **YAPISAL / ÖLÇÜM** diye ikiye ayrılmış ve
backend rozetini `renderer.backend.isWebGLBackend`'den okuyor —
`renderer.isWebGPURenderer`'dan **değil**: ikincisi `forceWebGL` dalında da `true`
döner ve rozete yalan söyletir.

Parçacık sayısını değiştirmek iki mesh'i yeniden örnekliyor ve dört tamponu
yeniden kuruyor. Bu **ana iş parçacığını dondurur** ve donma bilerek gizlenmiyor:
süresi HUD'daki "Son kurulum donması" satırına yazılıyor (bu makinede 500k'da
~220 ms, ~190 ms'i örnekleme).

### "Açık (PBO'suz)" seçeneği BİLEREK BOZUK

`src/sim/simulation.ts` içindeki `bond` modu üç durumlu:

| `bond`     | `setPBO(true)` | `bondPull` | Davranış                                               |
| ---------- | -------------- | ---------- | ------------------------------------------------------ |
| `"off"`    | çağrılmaz      | `0`        | eş kuvveti yok                                         |
| `"on"`     | **çağrılır**   | `0.0008`   | eş kuvveti iki backend'de de çalışır                   |
| `"broken"` | **çağrılmaz**  | `0.0008`   | WebGPU'da `"on"` gibi; WebGL2'de sessizce `"off"` gibi |

`"broken"` bir bug değil, makalenin kanıtı: WebGL2'de `.setPBO(true)` verilmezse
komşu okuması **sessizce** parçacığın kendi değerine çöküyor. Hata yok, uyarı yok,
konsol temiz, sonuç yanlış. Ölçüm modu bunu bir checksum'la kanıtlıyor (aşağıda).

## Test

```bash
npm test
```

**94 test yeşil** (11 dosya). Hiçbiri `document`, `window`, `navigator`,
`WebGL2RenderingContext` ya da `GPUDevice` kullanmıyor: headless vitest'te GPU yok.
Shader testleri bile GPU açmıyor — sahte bir renderer nesnesiyle `WGSLNodeBuilder`
ve `GLSLNodeBuilder` doğrudan Node'da koşuyor.

| Dosya                      | Test | Neyi çiviliyor                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shaders.test.ts`          | 16   | Aynı kernel iki backend: WGSL'de `var<storage, read_write>` + eş okuması + TSL'in kendi ürettiği sınır koruması; GLSL'de `texelFetch` **yalnız** PBO açıkken; PBO'suz dalda eş okumasının `nodeVarying0 - nodeVarying0`'a çökmesi; `@compute @workgroup_size( 64`; `.toReadOnly()` → `var<storage, read>`; transform feedback varying adları; döküm gövdesinin gerçekten dolu olması (`three/tsl` ↔ `three/src` karışım regresyonu) |
| `simulationShader.test.ts` | 16   | Aynı iddialar **uygulamanın gerçek `step` kernel'ı** üzerinde: 5 binding (2 read_write + 2 read + 1 uniform), `1023u - instanceIndex` eş okuması, dallanmasızlık (tek `if`), `bond` modlarının sampler sayısını değiştirmesi                                                                                                                                                                                                        |
| `surfaceSampler.test.ts`   | 9    | Toplam alanın `4π`'ye **alttan** yakınsaması; kutup kepi oranının Arşimet'in verdiği `0,1`'e düşmesi; düzgün-üçgen seçiminin aynı bandı **aşması**; tek üçgende analitik alan; indexed/non-indexed dallar; üretilen noktanın yüzeyde durması                                                                                                                                                                                        |
| `pickTriangle.test.ts`     | 8    | Binary search sınırları: `x = 0` → ilk üçgen, `x = total` → son üçgen, kümülatif sınıra tam denk gelen değer bir sonrakini seçmez                                                                                                                                                                                                                                                                                                   |
| `vram.test.ts`             | 8    | `vec4` tampon eleman başına 16 bayt, `vec3` sanılan 12; fark pozitif; `bufferReport` alanları girdiden birebir                                                                                                                                                                                                                                                                                                                      |
| `checksum.test.ts`         | 7    | FNV-1a: aynı girdi aynı çıktı, tek bitlik fark farklı çıktı, `Uint32Array` görünümü orijinali bozmaz                                                                                                                                                                                                                                                                                                                                |
| `sampleGeometry.test.ts`   | 7    | Çıktı uzunluğu `count * 4`, w bileşeni `[0,1)`, aynı tohum bit-birebir aynı dizi, hiçbir değer `NaN` değil                                                                                                                                                                                                                                                                                                                          |
| `stats.test.ts`            | 7    | Medyan/yüzdelik; boş dizide `NaN` (0 **değil**); girdi dizisi mutasyona uğramaz                                                                                                                                                                                                                                                                                                                                                     |
| `viewport.test.ts`         | 6    | `MAX_DPR = 2` kelepçesi, ölçek `[0.25, 1]`, sonuç asla 0                                                                                                                                                                                                                                                                                                                                                                            |
| `rng.test.ts`              | 5    | `mulberry32` aralığı, tekrar üretilebilirliği, farklı tohumun farklı dizi vermesi                                                                                                                                                                                                                                                                                                                                                   |
| `backendName.test.ts`      | 5    | Rozet backend bayrağını okur, `isWebGPURenderer`'ı değil                                                                                                                                                                                                                                                                                                                                                                            |

## Tip kontrolü ve derleme

```bash
npx tsc --noEmit   # 0 hata
npm run build      # tsc && vite build → dist/
```

`vite build`'in geçmesi shader'ın **çalıştığını** kanıtlamıyor: WGSL/GLSL çalışma
anında üretiliyor. Tarayıcı doğrulaması zorunlu.

## Node tarafı ölçümler (GPU yok)

### `npm run shaders` — shader dökümü

```bash
npm run shaders
```

`artifacts/` altına altı dosya yazar ve konsola **tek satır** `SHADERS {json}` basar:

| Dosya                | Kernel                            | Backend |
| -------------------- | --------------------------------- | ------- |
| `compute.wgsl`       | döküm kerneli (1024, `vec3`)      | WebGPU  |
| `compute.pbo.glsl`   | aynı kernel, `setPBO(true)`       | WebGL2  |
| `compute.nopbo.glsl` | aynı kernel, `setPBO` **yok**     | WebGL2  |
| `step.wgsl`          | uygulamanın gerçek `step` kerneli | WebGPU  |
| `step.pbo.glsl`      | gerçek `step`, `bond: "on"`       | WebGL2  |
| `step.nopbo.glsl`    | gerçek `step`, `bond: "broken"`   | WebGL2  |

Bu makinedeki gerçek çıktı:

```json
{
  "three": "0.185.1",
  "header": "// Three.js r185 - Node System",
  "wgsl": {
    "lines": 65,
    "bindings": 3,
    "hasReadWrite": true,
    "hasReadOnly": false,
    "hasNeighbourRead": true,
    "hasBoundsGuard": true
  },
  "glslPbo": {
    "lines": 80,
    "samplers": 1,
    "hasTexelFetch": true,
    "varyings": ["nodeVarying0", "nodeVarying1"]
  },
  "glslNoPbo": {
    "lines": 75,
    "samplers": 0,
    "hasTexelFetch": false,
    "varyings": ["nodeVarying0", "nodeVarying1"]
  },
  "simulation": {
    "count": 1024,
    "wgsl": {
      "lines": 85,
      "bindings": 5,
      "readWrite": 2,
      "readOnly": 2,
      "hasNeighbourRead": true,
      "hasBoundsGuard": true,
      "branchless": true
    },
    "glslOn": { "lines": 98, "samplers": 1, "hasTexelFetch": true },
    "glslBroken": { "lines": 92, "samplers": 0, "hasTexelFetch": false },
    "glslOff": { "lines": 92, "samplers": 0, "hasTexelFetch": false }
  }
}
```

`glslPbo.hasTexelFetch === true` ile `glslNoPbo.hasTexelFetch === false` arasındaki
tek fark bir satırlık `.setPBO(true)` çağrısı.

**Modül grafiği uyarısı:** `tools/dumpShaders.ts` içindeki **her** three import'u
`three/src/` altından gelir. `three/tsl` (build çıktısı) ile `three/src/...` ayrı
modül kopyalarıdır; karıştırırsanız `THREE.TSL: No stack defined for assign
operation` uyarısı çıkar ve kernel gövdesi **sessizce boş derlenir**.
`tools/dumpSimulation.ts` tam tersini yapar (builder ve kernel ikisi de build
çıktısından) — yasak olan iki grafiği tek builder'da buluşturmak.

### `npm run bench` — CPU ölçümleri

```bash
npm run bench
```

Konsola **tek satır** `BENCH {json}`. Bu makinede (Node v22.22.2, Apple M2 Pro):

| Ölçüm                                   | Değer                                                              |
| --------------------------------------- | ------------------------------------------------------------------ |
| Alan yakınsaması `16×8`                 | 224 üçgen · 12,1667 · `4π`'den %3,181 sapma                        |
| Alan yakınsaması `32×16`                | 960 üçgen · 12,4657 · %0,801                                       |
| Alan yakınsaması `64×32`                | 3968 üçgen · 12,5412 · %0,201                                      |
| Alan yakınsaması `128×64`               | 16128 üçgen · 12,5601 · %0,050                                     |
| Kutup kepi (`y > 0,8`), CDF             | **0,10002** (analitik `0,1`)                                       |
| Kutup kepi, üçgen başına düzgün seçim   | **0,19506** (2× fazla temsil)                                      |
| `setWeightAttribute` üst yarı oranı     | 0,95324 (yani %100 değil)                                          |
| CDF örnekleme 100k / 200k / 500k        | 17,63 / 31,83 / 79,16 ms → 176 / 159 / **158 ns/nokta**            |
| `MeshSurfaceSampler` 100k / 200k / 500k | 25,33 / 43,72 / 112,88 ms → 253 / 219 / **226 ns/nokta**           |
| CDF kurulumu (3968 üçgen)               | 0,209 ms                                                           |
| VRAM 100k / 200k / 500k (4 × `vec4`)    | 6,10 / 12,21 / 30,52 MiB (`vec3` sanılan: 4,58 / 9,16 / 22,89 MiB) |

Her hız ölçümü **3 koşu**, medyan raporlanıyor; ham koşular JSON'daki `runs`
alanında. Analitik `4π = 12,5664`; hesaplanan toplam **her zaman altında** kalır
(içe çizilmiş çokyüzlünün alanı küreden büyük olamaz) ve segment sayısıyla tek
yönlü küçülür — bedava bir doğrulama sayısı.

## Deterministik ölçüm modu — ÖLÇÜM URL'LERİ

```bash
npm run dev
```

| URL                                               | Ne ölçer                                  |
| ------------------------------------------------- | ----------------------------------------- |
| `http://localhost:5173/?measure=1&backend=webgpu` | WebGPU koşusu, tek satır `MEASURE {json}` |
| `http://localhost:5173/?measure=1&backend=webgl2` | `forceWebGL` koşusu, aynı alanlar         |

`?measure=1` açıldığında: arayüz ve rAF döngüsü kapanır, arka tampon **960×540**'a
kilitlenir (`devicePixelRatio` ve ölçek yok sayılır), tohumlar sabittir
(kaynak bulut `seed = 1`, hedef `seed = 2`), morph animasyonu kapalıdır ve `morphT`
elle set edilir, alt adım sayısı sabittir (`SUBSTEPS = 2`, delta-zaman **yok**),
kamera koda gömülüdür. Her ölçüm bloğu **60 ısınma + 180 ölçülen** kare.
Sonunda konsola **tek satır** `MEASURE {json}` düşer; başka `console.log` yok.

Koşu programı sırayla: (1) hız süpürmesi 100k/200k/500k · (2) eş bağı kapalı/açık ·
(3) morph maliyeti `morphT ∈ {0; 0,5; 1}` · (4) checksum (`off`/`on`/`broken`, her
biri **iki kez**, 240 adım, `getArrayBufferAsync` ile geri okuma) · (5) yeniden
kurulum donması · (6) `vec3` dolgusu kanıtı.

`MEASURE` şeması — aşağıdaki sayılar bu makinedeki **gerçek** WebGPU koşusundan
(Apple M2 Pro, headless Chrome 151), alan listesi olarak okuyun:

```json
{
  "backend": "webgpu",
  "forcedWebGL": false,
  "adapter": "apple / metal-3",
  "three": "0.185.1",
  "timestamps": true,
  "backing": { "width": 960, "height": 540 },
  "warmup": 60,
  "frames": 180,
  "substeps": 2,
  "speed": [
    {
      "count": 100000,
      "compute": { "median": 0.1409, "p95": 0.2654 },
      "render": { "median": 2.2395, "p95": 2.4692 },
      "frame": { "median": 8.3, "p95": 8.905 },
      "cpu": { "median": 0.3, "p95": 1 }
    }
  ],
  "bond": {
    "off": { "computeMedian": 0.1361, "cpuMedian": 0.2 },
    "on": { "computeMedian": 0.1347, "cpuMedian": 0.3 },
    "deltaMs": -0.0014
  },
  "morph": {
    "t0": { "computeMedian": 0.1345, "cpuMedian": 0.2 },
    "t05": { "computeMedian": 0.1357, "cpuMedian": 0.3 },
    "t1": { "computeMedian": 0.1358, "cpuMedian": 0.3 }
  },
  "checksum": {
    "count": 100000,
    "steps": 240,
    "off": 2846883600,
    "on": 3484484836,
    "broken": 375058886,
    "repeatable": { "off": true, "on": false, "broken": false },
    "brokenEqualsOff": false,
    "brokenEqualsOn": false,
    "maxAbsDiffBrokenOff": 0.08133101,
    "maxAbsDiffBrokenOn": 1.8e-7,
    "maxAbsDiffOnOff": 0.08133101
  },
  "rebuild": [
    { "count": 100000, "sampleMs": 41, "setupMs": 1.3, "totalMs": 42.3, "secondRunMs": 41.9 }
  ],
  "buffer": {
    "probe": "vec3",
    "beforeFirstFrame": { "itemSize": 3, "count": 1024, "arrayLength": 3072, "bytes": 12288 },
    "afterFirstFrame": { "itemSize": 4, "count": 1024, "arrayLength": 4096, "bytes": 16384 }
  }
}
```

Kurallar:

- **Zaman damgası yoksa uydurulmuyor.** `timestamps: false` gelirse `compute` ve
  `render` alanları `null` kalır, yalnız `frame` ve `cpu` okunur.
- GPU zaman damgaları **kuantize**: aynı medyanın tekrar etmesi sayacın çözünürlüğünü
  gösterir, kararlılığı değil.
- `frame.median` ekran yenileme hızına kilitli (`8,3 ms` = 120 Hz). Doygunluğu
  `compute` ve `render` sütunlarından okuyun, kare süresinden değil.
- `checksum` bloğunda zamanlama yok ve her yapılandırma **kendi renderer'ında**
  koşar. `trackTimestamp` bu blokta kapalı: 240 ardışık compute, 2048 sorguluk
  zaman damgası havuzunu doldurup uyarı bastırıyor.
- Ölçüm **gizli sekmede alınmaz**: `requestAnimationFrame` kısılır, sayılar bozulur.

### Makalenin ana iddiası: `checksum.brokenEqualsOff`

Bu makinede ölçülen:

| Backend | `off`      | `on`                     | `broken`   | `brokenEqualsOff` | `maxAbsDiffBrokenOff` |
| ------- | ---------- | ------------------------ | ---------- | ----------------- | --------------------- |
| WebGL2  | 2846883600 | 614728775                | 2846883600 | **`true`**        | **0**                 |
| WebGPU  | 2846883600 | (koşudan koşuya değişir) | (değişir)  | `false`           | 0,08133101            |

WebGL2 sütunu iddiayı **bit-birebir** kanıtlıyor: `setPBO` olmadan `"broken"`,
`"off"` ile aynı sonucu veriyor — eş kuvveti hiç uygulanmamış.

WebGPU tarafında `broken` ile `on` arasındaki **maksimum mutlak fark 1,8·10⁻⁷**
(yani aynı simülasyon), ama checksum'lar bit-birebir tutmuyor ve `repeatable`
alanı `false`: eş okuması ile eş yazması arasında senkronizasyon olmadığı için
sonuç koşudan koşuya kayan noktanın son basamağında oynuyor. `off` yapılandırması
(rastgele okuma yok) her koşuda **aynı** çıkıyor — hem WebGPU'da hem WebGL2'de,
üstelik iki backend'de de aynı sayı.

### Ham ölçüm kaydı

Seri konvansiyonu: bir koşunun konsola düşen `MEASURE {json}` satırları
`measurements-YYYY-MM-DD.jsonl` dosyasına, satır başına bir koşu olacak şekilde
yazılır (`id` alanı URL etiketiyle, soğuk koşular `note` ile işaretli).
Makaledeki tablolar bu dosyaya dayanır.

## Bilinen kapsam sınırları

- Kernel dallanmıyor, atomik/barrier kullanmıyor, kendi indeksi dışına **yazmıyor**.
  (Transform feedback başka bir yuvaya yazamaz; iki backend'i birden hedefleyen
  her kernel bu kurala uymak zorunda.)
- Parçacık sayısı değişince tamponlar yeniden kuruluyor; `instancedArray` yeniden
  boyutlandırılmıyor.
- Morph hedefleri bir kez örnekleniyor; çalışma anında yeni mesh yüklenmiyor.
- Eş bağı fiziksel bir kuvvet değil: görsel bir bağ ve rastgele okumanın kobayı.
- 1.000.000 parçacık seçeneği **yok** (seri demo ağırlık kuralı). Sınır bellek
  değil — 1M'de bile dört tampon WebGPU'nun varsayılan
  `maxStorageBufferBindingSize` sınırının altında kalıyor — CPU örnekleme donması.

## Lisans

MIT — bkz. `LICENSE`.
