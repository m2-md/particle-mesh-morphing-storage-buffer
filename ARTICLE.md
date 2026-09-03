# Tek Çekirdek, İki Shader: TSL Compute ile Mesh'ten Mesh'e Parçacık Morph'u

*Parçacıkların konumu GPU'da kalıyor, hedefleri iki mesh yüzeyinden alan-ağırlıklı örneklemeyle çıkıyor ve tek bir TSL kernel'ı WebGPU'da `var<storage, read_write>`, WebGL2'de `texelFetch` olarak derleniyor. İki shader'ın dökümünü GPU'suz alıyoruz; eksik tek bir satır, komşu okumasını sessizce parçacığın kendi değerine çeviriyor.*

*Tahmini okuma süresi: 19 dakika*

---

Aynı satırı iki kere okudum, ikisinde de aynı şeyi gördüm ve inanmadım.

Elimde tek bir TSL kernel'ı vardı. İçinde bir parçacığın eşine baktığı bir satır: `positionBuffer.element(partnerIndex)`. WebGPU tarafında üretilen WGSL bunu olması gerektiği gibi yazmıştı: `positionBuffer.value[ ( 1023u - instanceIndex ) ]`. Aynı kernel'dan üretilen GLSL'de o okuma yoktu. Yerinde parçacığın kendi konumu duruyordu.

Kaynak dosya aynı. Bir tarafta eşin konumu okunuyor, öteki tarafta parçacığın kendisi. Derleyici ikisini de kabul ediyor.

Fark tek bir çağrıydı: `.setPBO(true)`.

Bu yazının konusu o çağrının etrafındaki daha büyük mesele: veriyi GPU'da bırakmak. Parçacığın konumu her karede CPU'dan gönderilmiyorsa nerede duruyor, o adres kareler arasında neden hayatta kalıyor ve bir parçacık komşusunun adresine bakabiliyor mu? Aynı kodu iki backend'e derlediğinizde bu sorular aynı cevabı almıyor. Asıl mesele orada.

Sıra şöyle. Açılışta `instancedArray`'in gerçekte ne ürettiğine ve bu tamponun neden kareler arasında yaşadığına bakıyoruz. Oradan iki mesh yüzeyini alan-ağırlıklı bir CDF ile örnekleyip parçacık hedeflerine çeviriyoruz; küre yüzeyinde bunun neden şart olduğunu Arşimet'in bir teoremi sayıya bağlıyor. Asıl bölüm ortada: tek bir TSL kernel'ı yazıp aynı kaynaktan üretilen WGSL ile GLSL'i tarayıcı açmadan, Node'da döküyoruz. `vec3` sandığınız tamponun bellekte `vec4` olması, `setPBO` eksikliğinin sessiz çöküşü ve WebGL2'de yorum satırına derlenen barrier'lar oradan çıkıyor. Kapanışta iki backend'in compute ve render maliyeti, örnekleme süresi, VRAM ve üretilen shader'ların satır sayısı var.

Sürüm notu: `three@0.185.1`, TSL, `WebGPURenderer` (WebGPU + WebGL2 backend), TypeScript, Vite, vitest. React yok, R3F yok, hazır parçacık kütüphanesi yok.

Bir de kardeş ayrımı. Parçacıkları bu blogda bir kez ham WebGPU ile sürmüştük: elle WGSL, elle bind group, elle `dispatchWorkgroups`. Bu yazı onun bir soyutlama katmanı yukarısı. Burada hiç WGSL yazmıyoruz; iki dilde birden WGSL ve GLSL üretiyoruz ve işimizin çoğu o üretilen metni okumak.

### Parçacık Nerede Yaşıyor

Klasik parçacık döngüsünde konumlar bir `Float32Array`'de durur, CPU her karede hepsini günceller, sonuç GPU'ya yüklenir. Yüz bin parçacıkta bu, tek çekirdekte yüz bin çarp-topla ve her karede yukarı akan bir megabaytın üstü demek.

Compute shader (hesaplama shader'ı) bu tablodan iki kalemi birden siliyor. Konum GPU'da doğuyor, GPU'da güncelleniyor, GPU'da çiziliyor. CPU'ya kalan iş başlangıç verisini bir kez göndermek ve uniform'ları (kernel'a dışarıdan verilen sabitleri) oynatmak.

TSL tarafında bu tamponu açan çağrı tek satır:

```ts
import { instancedArray } from "three/tsl";

const positionBuffer = instancedArray(count, "vec4").setName("position");
```

Bunun ne ürettiğine bakmakta fayda var, çünkü isim biraz yanıltıyor. `instancedArray` bir `StorageInstancedBufferAttribute` oluşturup onu bir `StorageBufferNode`'a sarıyor. Tampon `StaticDrawUsage` ile işaretli ve `version` alanı kendiliğinden artmıyor. three'nin attribute yöneticisi de tam olarak buna bakıyor: sürüm değişmemişse ve kullanım `DynamicDrawUsage` değilse yeniden yükleme yapmıyor.

Sonuç: veri bir kez gidiyor, orada kalıyor. Kare başına CPU→GPU yükleme yok.

İkinci mekanizma daha ilginç. WebGPU backend'i bu tamponu oluştururken iki bayrağı birden veriyor: `GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX`. Aynı bellek bloğu hem compute geçişinde yazılabilir hem de vertex aşamasında okunabilir. Compute'un yazdığını render'ın görmesi için arada bir kopya yok.

Mahalle benzetmesiyle düşünün: her parçacığın kalıcı bir kapı numarası var (`instanceIndex`) ve o numara kareler boyunca değişmiyor. CPU mahalleyi bir kere kuruyor, sonra çekiliyor. Numaraların kalıcılığı bu yazının yarısını taşıyacak, çünkü sabit adres yalnızca "kendi evine git" demeye yaramıyor; "komşunun kapısını çal" demeye de yarıyor.

Kullanacağımız dört tampon şunlar:

```ts
// src/sim/simulation.ts (parça)
import { instancedArray } from "three/tsl";

const positionBuffer = instancedArray(count, "vec4").setName("position");
const velocityBuffer = instancedArray(count, "vec4").setName("velocity");

// Hedef bulutları: bir kez örneklenip GPU'ya konuyor, bir daha yazılmıyor.
const sourceBuffer = instancedArray(source, "vec4").setName("sourceTarget").toReadOnly();
const targetBuffer = instancedArray(target, "vec4").setName("morphTarget").toReadOnly();
```

`instancedArray`'e sayı yerine hazır bir `TypedArray` verebiliyorsunuz; örneklenmiş mesh noktalarını doğrudan tampona koymanın yolu bu. `.toReadOnly()` çağrısı da süs değil: WGSL tarafında `var<storage, read>` üretiyor ve derleyiciye "bu tampona kimse yazmayacak" diyor.

Peki hedef bulutlarındaki o noktalar nereden geliyor?

### Hedefi Yüzeyden Çekmek

Bir mesh'in yüzeyinden rastgele nokta üretmek iki adımlık bir iş: hangi üçgen, sonra o üçgenin neresi.

İkinci adım kolay. Bir üçgenin içinde düzgün dağılmış nokta için iki rastgele sayı alıp barycentric (barisentrik) koordinat kuruyorsunuz; toplam 1'i aşarsa ikisini de katlıyorsunuz. Katlama, paralelkenarın dışarıda kalan yarısını üçgenin içine geri döndürüyor.

Birinci adım işin can alıcı kısmı. Üçgenleri düzgün olasılıkla seçerseniz yüzeyde düzgün dağılım elde edemezsiniz; küçük üçgenlerin üstüne büyük üçgenlerle aynı sayıda nokta düşer. Doğru seçim alanla orantılı olmalı. Üçgen alanlarını kümülatif toplayıp bir CDF (kümülatif dağılım fonksiyonu) kuruyoruz, rastgele bir sayıyı da bu dizide binary search ile arıyoruz.

Aynı mahallenin tapu kaydı gibi düşünün: hane sayısını parselin metrekaresine göre dağıtıyoruz, parsel sayısına göre değil.

```ts
// src/sampling/surfaceSampler.ts
import { Vector3 } from "three";
import type { BufferGeometry } from "three";

export interface SurfaceSampler {
  readonly triangleCount: number;
  readonly totalArea: number;
  /** rng(): [0,1) — dışarıdan verilir ki tohumlanabilsin. */
  sample(rng: () => number, target: Vector3): Vector3;
}

export function buildSurfaceSampler(geometry: BufferGeometry): SurfaceSampler {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const triangleCount = index ? index.count / 3 : position.count / 3;

  // Kümülatif toplam Float64: 32 bit, on binlerce küçük alanı topladığınızda
  // sonlara doğru artışı yutmaya başlıyor ve son üçgenler seçilemez hâle geliyor.
  const cumulative = new Float64Array(triangleCount);

  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const ab = new Vector3();
  const ac = new Vector3();
  const cross = new Vector3();

  const vertexOf = (triangle: number, corner: number): number =>
    index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner;

  let total = 0;
  for (let t = 0; t < triangleCount; t++) {
    a.fromBufferAttribute(position, vertexOf(t, 0));
    b.fromBufferAttribute(position, vertexOf(t, 1));
    c.fromBufferAttribute(position, vertexOf(t, 2));
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    total += cross.crossVectors(ab, ac).length() * 0.5;
    cumulative[t] = total;
  }

  function pickTriangle(x: number): number {
    let lo = 0;
    let hi = triangleCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  return {
    triangleCount,
    totalArea: total,
    sample(rng, target) {
      const t = pickTriangle(rng() * total);

      a.fromBufferAttribute(position, vertexOf(t, 0));
      b.fromBufferAttribute(position, vertexOf(t, 1));
      c.fromBufferAttribute(position, vertexOf(t, 2));

      let u = rng();
      let v = rng();
      if (u + v > 1) {
        u = 1 - u;
        v = 1 - v;
      }

      return target
        .copy(a)
        .addScaledVector(ab.subVectors(b, a), u)
        .addScaledVector(ac.subVectors(c, a), v);
    },
  };
}
```

Rastgeleliği dışarıdan almanın sebebi tekrarlanabilirlik. Aynı tohum, aynı bulut; ölçüm modunun deterministik olması buna bağlı:

```ts
// src/sampling/rng.ts
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

Bulutu doğrudan GPU tamponunun beklediği düzende yazıyoruz. Dördüncü bileşene parçacık başına bir faz koyuyoruz; morph'un neden hepsi aynı anda başlamasın diye. O alanın neden bedava olduğunu birazdan konuşacağız.

```ts
// src/sampling/sampleGeometry.ts
import { Vector3 } from "three";
import type { BufferGeometry } from "three";
import { buildSurfaceSampler } from "./surfaceSampler";
import { mulberry32 } from "./rng";

export interface SampleResult {
  readonly data: Float32Array; // count * 4: x, y, z, faz
  readonly totalArea: number;
  readonly triangleCount: number;
}

export function sampleGeometry(
  geometry: BufferGeometry,
  count: number,
  seed: number,
): SampleResult {
  const sampler = buildSurfaceSampler(geometry);
  const rng = mulberry32(seed);
  const data = new Float32Array(count * 4);
  const p = new Vector3();

  for (let i = 0; i < count; i++) {
    sampler.sample(rng, p);
    data[i * 4 + 0] = p.x;
    data[i * 4 + 1] = p.y;
    data[i * 4 + 2] = p.z;
    data[i * 4 + 3] = rng(); // faz: morph'u parçacık başına kaydıracağız
  }

  return {
    data,
    totalArea: sampler.totalArea,
    triangleCount: sampler.triangleCount,
  };
}
```

Bu kodun güzel yanı kendini doğrulaması. Yarıçapı 1 olan bir kürenin alanı `4π = 12,566`. `SphereGeometry` düz üçgenlerden oluştuğu için hesapladığımız toplam her zaman bunun biraz altında kalır: içe çizilmiş bir çokyüzlünün alanı küreden küçüktür, büyük olamaz. Segment sayısını artırınca sapma tek yönlü olarak küçülüyor ve bu tek bir testle çivileniyor.

| Küre segmentleri | Üçgen | Toplam alan | 4π'den sapma |
|---|---|---|---|
| 16 × 8 | 224 | 12,167 | %3,181 |
| 32 × 16 | 960 | 12,466 | %0,801 |
| 64 × 32 | 3.968 | 12,541 | %0,201 |
| 128 × 64 | 16.128 | 12,560 | %0,050 |

Bedava bir doğrulama sayısı. CDF'i yanlış kurarsanız toplam alan tutmaz.

### Kutup Tuzağı: Neden Alan-Ağırlıklı

"Alanla orantılı seçim" cümlesi kulağa ders kitabı titizliği gibi geliyor. Küre üzerinde bunun bedeli gözle görülüyor.

`SphereGeometry(1, 64, 32)` enlem halkalarından oluşur. Her halkada aynı sayıda üçgen var: 64. Ama kutuplardaki halkaların üçgenleri minicik, ekvattakiler geniş. Üçgenleri düzgün olasılıkla seçerseniz kutuplara ekvatordakiyle aynı sayıda parçacık düşer ve küre iki ucundan parlar.

Bunu bir sayıya bağlayabiliyoruz, hem de analitik olarak. Arşimet'in şapka kutusu teoremi diyor ki bir kürenin iki paralel düzlem arasında kalan kuşağının alanı, yalnızca o iki düzlem arasındaki yüksekliğe bağlıdır. Yarıçapı 1 olan kürede `y > 0,8` bölgesinin alanı `2π · 1 · 0,2`; toplam alan `4π`. Oran tam olarak `0,1`.

Doğru örneklenmiş bir bulutta noktaların yüzde onu o kutup kepinde olmalı. Ne bir eksik ne bir fazla.

Üçgen başına düzgün seçimde ise oran, o bölgeye düşen üçgenlerin *sayısına* gider. `y > 0,8`, kutuptan itibaren 36,87 derecelik bir açı demek; 32 enlem halkasının yaklaşık 6,55'i oraya düşüyor. Beklenti yüzde on değil, yüzde yirmiye yakın.

| Yöntem | `y > 0,8` oranı | Analitik beklenti |
|---|---|---|
| Alan-ağırlıklı CDF | %10,002 | %10,00 |
| Üçgen başına düzgün | %19,506 | — (üçgen sayısına gider) |

Bu testte doğru cevabı kod vermiyor. Rasgele sayı üretecinizin de örnekleyicinizin de bilmediği bir sabit var ortada ve kod ona yaklaşmak zorunda.

### Hazır Olan: MeshSurfaceSampler

three'nin kendi eklentileri arasında bu işi yapan bir sınıf zaten var ve iyi çalışıyor:

```ts
// tools/bench.ts (parça)
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";

/**
 * `setRandomGenerator` r185 kaynağında var (`MeshSurfaceSampler.js:162`) ama
 * `@types/three` bildirmiyor. Tohumlanabilirlik olmadan kıyas tekrarlanamaz.
 */
type SeedableSampler = MeshSurfaceSampler & {
  setRandomGenerator(fn: () => number): MeshSurfaceSampler & SeedableSampler;
};

function seedable(sampler: MeshSurfaceSampler): SeedableSampler {
  return sampler as SeedableSampler;
}

const sampler = seedable(new MeshSurfaceSampler(mesh)).setRandomGenerator(mulberry32(1)).build();
sampler.sample(position, normal);
```

Bunu kullanmamak için bir gerekçeniz yoksa kullanın; normal, renk ve UV de dolduruyor, biz doldurmuyoruz. Projede onu çıkarmadım, kontrol grubu olarak bıraktım: aynı testte iki yol aynı geometriyi örnekliyor ve ikisinin kutup oranı da aynı analitik sayıya yaklaşıyor. Elle yazmanın karşılığı hız; o da ölçüm bölümünde iki satır olarak duruyor.

Bir davranışına da not düşeyim. `setWeightAttribute(name)` ile örneklemeyi bir vertex özniteliğine göre ağırlıklandırabiliyorsunuz; küreye "yalnız üst yarı" demek için `y > 0` olan köşelere 1 verdim.

Örneklerin tamamı üst yarıya düşmedi. %95,32'si düştü.

Sebebi bir kusur değil, tanımın kendisi: ağırlık köşe başına ve üçgenin ağırlığı köşelerinin ortalaması. Ekvatoru kesen üçgenlerin iki köşesi 1, biri 0 olduğu için o üçgenler ortalama bir ağırlıkla seçilmeye devam ediyor ve içlerinde alt yarıya düşen noktalar var. Keskin bir maske istiyorsanız ağırlık vermek yetmiyor, geometriyi bölmek gerekiyor.

### Çekirdek: Tek `Fn`, İki İş

Şimdi asıl işe. Kernel iki parçadan oluşuyor: bir kez koşan bir başlatma, her karede koşan bir adım.

```ts
// src/sim/simulation.ts (parça)
import { Fn, float, instanceIndex, instancedArray, mix, uint, uniform, vec4 } from "three/tsl";

export function createSimulation(options: SimulationOptions) {
  const { count, source, target, bond } = options;

  const positionBuffer = instancedArray(count, "vec4").setName("position");
  const velocityBuffer = instancedArray(count, "vec4").setName("velocity");
  const sourceBuffer = instancedArray(source, "vec4").setName("sourceTarget").toReadOnly();
  const targetBuffer = instancedArray(target, "vec4").setName("morphTarget").toReadOnly();

  // Rastgele indeksle okunan TEK tampon bu. WebGL2 yolunda zorunlu.
  if (bond !== "off" && bond !== "broken") positionBuffer.setPBO(true);

  const morphT = uniform(0); // 0 -> 1, CPU tarafında sürülüyor
  const stiffness = uniform(0.018);
  const damping = uniform(0.92);
  const bondPull = uniform(bond === "off" ? 0 : 0.0008);

  const init = Fn(() => {
    // Faz da w bileşeninde kopyalanıyor.
    positionBuffer.element(instanceIndex).assign(sourceBuffer.element(instanceIndex));
    velocityBuffer.element(instanceIndex).assign(vec4(0));
  })().compute(count);

  const step = Fn(() => {
    const pos = positionBuffer.element(instanceIndex);
    const vel = velocityBuffer.element(instanceIndex);
    const from = sourceBuffer.element(instanceIndex).xyz;
    const to = targetBuffer.element(instanceIndex).xyz;

    // Parçacık başına kaydırmalı zaman: faz 0 olan erken başlar, 1 olan geç.
    const SPREAD = 0.35;
    const local = morphT
      .mul(float(1 + SPREAD))
      .sub(pos.w.mul(float(SPREAD)))
      .clamp(0, 1);
    // smoothstep'i elle yazıyoruz: t*t*(3 - 2t)
    const eased = local.mul(local).mul(float(3).sub(local.mul(2)));

    const destination = mix(from, to, eased);

    // Eş: i ile (n-1-i) karşılıklı bir çift. Kendi indeksi DIŞINDA bir okuma.
    const partnerIndex = uint(count - 1).sub(instanceIndex);
    const partner = positionBuffer.element(partnerIndex).xyz;

    const nextVel = vel.xyz
      .add(destination.sub(pos.xyz).mul(stiffness))
      .add(partner.sub(pos.xyz).mul(bondPull))
      .mul(damping);

    velocityBuffer.element(instanceIndex).assign(vec4(nextVel, 0));
    positionBuffer.element(instanceIndex).assign(vec4(pos.xyz.add(nextVel), pos.w));
  })().compute(count);

  return { positionBuffer, init, step, morphT, stiffness, damping, bondPull };
}
```

Birkaç tasarım kararı burada gizli, açalım.

Her invocation (kernel'ın tek bir parçacık için koşan kopyası) yalnız kendi indeksine yazıyor. Bu bir üslup tercihi değil, taşınabilirliğin şartı: WebGL2 yolunda yazma işi transform feedback (dönüşüm geri beslemesi) ile yapılıyor ve transform feedback bir invocation'ı yalnızca kendi çıkış yuvasına yazdırabiliyor. Başka bir parçacığın konumunu değiştiren bir kernel WebGPU'da çalışır, WebGL2'de sessizce başka bir şey yapar.

Okuma tarafı serbest. `partnerIndex` kendi indeksimiz değil ve bu satır fragment shader'ın yapamadığı şeyin ta kendisi: başka bir invocation'ın o anki durumunu görmek.

Eş bağının fiziksel bir karşılığı yok. Görsel bir bağ; morph sırasında iki bulut arasında ince iplikler oluşturuyor. Aynı zamanda bu yazının kobayı: rastgele indeksle okuma yapan tek satır o.

Sınır koruması yok, çünkü gerek yok. TSL üretilen shader'a `if ( instanceIndex >= count ) { return; }` satırını kendisi koyuyor. Ham WebGPU yazarken bunu elle yazmak ve `Math.ceil` ile grup sayısını hesaplamak zorundaydık; burada işi soyutlama yapıyor.

Peki üretilen shader'ı görmenin bir yolu var mı?

### Aynı Kaynaktan İki Shader

Var, üstelik tarayıcı bile gerekmiyor. `WGSLNodeBuilder` ve `GLSLNodeBuilder` saf JavaScript sınıfları; ellerine bir renderer benzeri nesne verirseniz Node'da çalışıyorlar.

```ts
// tools/dumpShaders.ts (parça)
import { context, vec3 } from "three/src/nodes/TSL.js";
import WGSLNodeBuilder from "three/src/renderers/webgpu/nodes/WGSLNodeBuilder.js";
import GLSLNodeBuilder from "three/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js";

/** Node builder'ın beklediği en küçük renderer yüzeyi. Test dublörü. */
function fakeRenderer(isWebGL: boolean) {
  const backend = isWebGL
    ? { isWebGLBackend: true, extensions: { has: () => false } }
    : { isWebGPUBackend: true, device: null };

  return {
    backend: {
      ...backend,
      hasFeature: () => false,
      getMaxAnisotropy: () => 1,
      get: () => ({}),
      has: () => false,
    },
    isWebGPURenderer: true,
    library: null,
    getRenderTarget: () => null,
    getMRT: () => null,
    contextNode: context(vec3(0)), // null OLAMAZ
    coordinateSystem: 2000,
    outputColorSpace: "srgb",
    currentColorSpace: "srgb-linear",
    toneMapping: 0,
    getDrawingBufferSize: () => ({ x: 1, y: 1 }),
    getPixelRatio: () => 1,
    debug: {},
    hasFeature: () => false,
  };
}

/**
 * `@types/three`'de `NodeBuilder` neredeyse boş bir soyut sınıf: `build()` de
 * `computeShader` de bildirilmemiş. Kullandığımız yüzeyi burada yazıyoruz.
 */
interface ComputeBuilder {
  build(): void;
  computeShader: string;
  transforms?: Array<{ varyingName: string }>;
}

function makeBuilder(kernel: unknown, isWebGL: boolean): ComputeBuilder {
  const Builder = isWebGL ? GLSLNodeBuilder : WGSLNodeBuilder;
  return new Builder(kernel as never, fakeRenderer(isWebGL) as never) as unknown as ComputeBuilder;
}

export function dumpCompute(kernel: unknown, isWebGL: boolean): string {
  const builder = makeBuilder(kernel, isWebGL);
  builder.build();
  return builder.computeShader;
}
```

Burada bir tuzak var ve bir buçuk saatimi aldı. `three/tsl` (paketin build çıktısı) ile `three/src/...` (kaynak ağacı) iki ayrı kopya. Döküm için builder'ları `three/src` altından alıyorsanız kernel'ı da oradan almalısınız. Karıştırırsanız `THREE.TSL: No stack defined for assign operation` uyarısını alıyorsunuz ve kernel gövdesi boş derleniyor. Uygulama kodu `three/tsl`'i kullanmaya devam ediyor; ayrım yalnızca döküm aracında.

Döküm için kasten küçük bir kernel kullanıyorum. Üç satır, iki tampon, bir eş okuması:

```ts
// tools/dumpShaders.ts (döküm kerneli)
/**
 * Döküm kerneli: kasten küçük. Üç satır, iki tampon, bir eş okuması.
 * `vec3` kullanıyoruz — WGSL çıktısında `array< vec3<f32> >` görünsün diye.
 */
export function buildDumpKernel({ pbo }: { pbo: boolean }) {
  const positionBuffer = instancedArray(1024, "vec3").setName("positionBuffer");
  const velocityBuffer = instancedArray(1024, "vec3").setName("velocityBuffer");

  // Rastgele indeksle okunan TEK tampon konum tamponu — simülasyondaki kuralın aynısı.
  if (pbo) positionBuffer.setPBO(true);

  return Fn(() => {
    const pos = positionBuffer.element(instanceIndex);
    const vel = velocityBuffer.element(instanceIndex);
    const partner = positionBuffer.element(uint(1023).sub(instanceIndex));
    positionBuffer
      .element(instanceIndex)
      .assign(pos.add(vel).add(partner.sub(pos).mul(float(0.001))));
  })().compute(1024);
}
```

WebGPU tarafında çıkan WGSL'in taşıyıcı satırları:

```wgsl
// artifacts/compute.wgsl — boş bölüm başlıkları atıldı, sekmeler boşluğa
// çevrildi, tek satırlık uzun atama elle sarıldı. Gerisi birebir.
// Three.js r185 - Node System

var<private> instanceIndex : u32;

struct positionBufferStruct {
    value : array< vec3<f32> >
};
@binding( 0 ) @group( 0 )
var<storage, read_write> positionBuffer : positionBufferStruct;

struct velocityBufferStruct {
    value : array< vec3<f32> >
};
@binding( 1 ) @group( 0 )
var<storage, read_write> velocityBuffer : velocityBufferStruct;

struct objectStruct {
    nodeUniform2 : u32
};
@binding( 2 ) @group( 0 )
var<uniform> object : objectStruct;

@compute @workgroup_size( 64, 1, 1 )
fn main( @builtin( global_invocation_id ) globalId : vec3<u32>,
    @builtin( workgroup_id ) workgroupId : vec3<u32>,
    @builtin( local_invocation_id ) localId : vec3<u32>,
    @builtin( num_workgroups ) numWorkgroups : vec3<u32> ) {

    instanceIndex = globalId.x
        + globalId.y * ( 64 * numWorkgroups.x )
        + globalId.z * ( 64 * numWorkgroups.x ) * ( 1 * numWorkgroups.y );

    if ( instanceIndex >= object.nodeUniform2 ) { return; }

    positionBuffer.value[ instanceIndex ] = ( ( positionBuffer.value[ instanceIndex ]
        + velocityBuffer.value[ instanceIndex ] )
        + ( ( positionBuffer.value[ ( 1023u - instanceIndex ) ]
        - positionBuffer.value[ instanceIndex ] ) * vec3<f32>( 0.001 ) ) );

}
```

Üç şey burada kanıtlanıyor. Tampon `read_write` erişimli kalıcı bir storage buffer (depolama tamponu). Eş okuması olduğu gibi duruyor: `positionBuffer.value[ ( 1023u - instanceIndex ) ]`. Sınır koruması TSL tarafından üretilmiş.

Aynı kernel, WebGL2 backend'i:

```glsl
// artifacts/compute.pbo.glsl — precision blokları ve boş bölümler atıldı, iki
// uzun texelFetch satırı elle sarıldı, iki satıra açıklama eklendi. Gerisi birebir.
#version 300 es

// Three.js r185 - Node System

uniform highp sampler2D nodeUniform0;          // konum tamponunun PBO dokusu

out vec3 nodeVarying0;                         // transform feedback çıkışları
out vec3 nodeVarying1;

layout( location = 0 ) in vec3 nodeAttribute1;
layout( location = 1 ) in vec3 nodeAttribute2;

vec3 nodeVar0;
uint nodeVar0Size;
vec3 nodeVar1;

void main() {

    // transforms
    nodeVarying0 = nodeAttribute1;
    nodeVarying1 = nodeAttribute2;

    nodeVar0Size = uint( textureSize( nodeUniform0, 0 ).x );
    nodeVar0 = vec4(texelFetch( nodeUniform0, ivec2(uint( gl_InstanceID ) % nodeVar0Size,
        uint( gl_InstanceID ) / nodeVar0Size), int( 0 ) )).xyz;
    nodeVar1 = vec4(texelFetch( nodeUniform0, ivec2(( 1023u - uint( gl_InstanceID ) ) % nodeVar0Size,
        ( 1023u - uint( gl_InstanceID ) ) / nodeVar0Size), int( 0 ) )).xyz;
    nodeVarying0 = ( ( nodeVar0 + nodeVarying1 ) + ( ( nodeVar1 - nodeVar0 ) * vec3( 0.001 ) ) );

    gl_PointSize = 1.0;

}
```

Burada olan biteni bir kez düzgün söylemek gerek.

"WebGL2'de compute shader yok" cümlesi doğru; WebGL2 spesifikasyonunda compute yok. Ama three r185'in WebGL2 backend'i compute'u atlamıyor, hata da vermiyor: emüle ediyor. Compute programını bir vertex shader olarak derliyor, yanına boş bir fragment shader koyuyor, `RASTERIZER_DISCARD` açıyor, çıkışları transform feedback varying'lerine bağlıyor ve `drawArraysInstanced(POINTS, 0, 1, count)` çağırıyor. Yazma böyle oluyor. Rastgele indeksli okuma için de tamponu bir `DataTexture`'a kopyalayıp `texelFetch` ile okuyor. Çift tamponlu ping-pong'u da kendisi yapıyor; her geçişten sonra tamponları takas ediyor.

Bu yazıya "WebGL2 için position texture ping-pong'unu elle yazacağız" diye başlamıştım; o bölüm, three'nin içinde zaten yazılmış hâlde duruyordu. Elle yazmak savunulabilir bir tercih ama yeni bir bilgi üretmiyor; ilginç olan, aynı kaynaktan iki farklı stratejinin çıktığını görebilmek.

Compute yolunda hiçbir yetenek kontrolü de yok. `renderer.computeAsync(kernel)` her iki backend'de aynı şekilde çağrılıyor.

O `texelFetch` yolunu açan bayrak, açılışta gördüğümüz `setPBO`: ilgili tampon için bir doku kopyası istiyorsunuz. Bayrağı çekmezseniz döküm de değişiyor. Üçünü yan yana koyalım.

| Döküm | Satır | WGSL binding / GLSL sampler |
|---|---|---|
| WGSL (WebGPU) | 65 | 3 |
| GLSL (WebGL2, PBO açık) | 80 | 1 |
| GLSL (WebGL2, PBO kapalı) | 75 | 0 |

### `vec3` Görünüyor, `vec4` Duruyor

Yukarıdaki WGSL dökümüne bir daha bakın: `array< vec3<f32> >`. Tamponu `instancedArray(1024, "vec3")` diye açtık, shader da `vec3` diyor. Her şey tutarlı görünüyor.

Bellekte öyle değil.

WGSL storage buffer'larda paketlenmiş `vec3` desteklemiyor. three de bunu biliyor ve tamponu oluştururken sessizce dolduruyor: `itemSize` 3 ise 4 yapıyor, diziyi yeni adımlamaya göre yeniden yazıyor. Üstelik bunu attribute nesnesinin üstünde, yerinde yapıyor.

İki sonucu var. Birincisi bellek: `vec3` bir tampon GPU'da eleman başına 12 değil 16 bayt yer kaplıyor. Yüzde otuz üç fazla VRAM, hiçbir yerde yazmadan.

İkincisi daha sinsi. WebGPU'da ilk render'dan sonra `attribute.itemSize` artık 3 değil, 4 (WebGL2'de aynı deney 3'te kalıyor — ölçtüğümüz `vec3` probu WebGPU'da 3→4 dolgu alıyor, WebGL2'de dolgu hiç yok). Bayt hesabını `itemSize`'dan türeten bir ölçüm kodu backend'e ve kareye göre farklı sayı veriyor. Ölçüm modunda ikisini de basıyoruz:

```ts
// src/measure/vram.ts (parça)
export interface BufferReport {
  itemSize: number;
  count: number;
  arrayLength: number;
  bytes: number;
}

export interface BufferLike {
  value: { itemSize: number; count: number; array: ArrayLike<number> };
}

export function bufferReport(node: BufferLike): BufferReport {
  return {
    itemSize: node.value.itemSize, // ilk kareden önce 3, sonra 4 olabilir
    count: node.value.count,
    arrayLength: node.value.array.length,
    bytes: node.value.array.length * 4,
  };
}
```

Karar basit: baştan `vec4` kullanın. GPU nasılsa 16 bayta yuvarlayacak, dördüncü bileşen bedava. Simülasyonda o alanı faza verdik; ömür, rastgele tohum ya da parçacık başına ağırlık için de aynı boşluk duruyor.

Bunu öğrenene kadar üç tamponu `vec3` tutuyordum ve VRAM hesabımın neden tutmadığını anlamamıştım. Fazladan bellek zaten ödeniyordu; bedava olanı kullanmıyordum.

### Eksik Olan Tek Satır

Şimdi yazının başındaki sahneye dönelim.

Aynı döküm kernelini `setPBO(true)` olmadan derlerseniz GLSL şuna dönüşüyor:

```glsl
// artifacts/compute.nopbo.glsl — precision blokları ve boş bölümler atıldı.
// Gerisi birebir: tek bir uniform, tek bir sampler bile yok.
#version 300 es

// Three.js r185 - Node System

out vec3 nodeVarying0;
out vec3 nodeVarying1;

layout( location = 0 ) in vec3 nodeAttribute0;
layout( location = 1 ) in vec3 nodeAttribute1;

void main() {

    // transforms
    nodeVarying0 = nodeAttribute0;
    nodeVarying1 = nodeAttribute1;

    nodeVarying0 = ( ( nodeVarying0 + nodeVarying1 ) + ( ( nodeVarying0 - nodeVarying0 ) * vec3( 0.001 ) ) );

    gl_PointSize = 1.0;

}
```

`texelFetch` yok. Sampler yok. Eş okuması `nodeVarying0`'a, yani parçacığın kendi konumuna çökmüş.

Bunun matematiksel karşılığı şu: `(partner - pos) * 0.001` ifadesi `(pos - pos) * 0.001` oluyor, o da tam olarak sıfır. Eş bağı yok olmuş. Ama sıfır eklemek bir hata üretmiyor; kuvvet sessizce iptal oluyor ve simülasyon "eş bağı kapalı" hâline dönüşüyor.

Derleyici şikâyet etmiyor. three uyarı basmıyor. Konsol temiz. Demo akıyor. Sonuç yanlış.

Mahalle duruyor, kapı numaraları yerinde. Basılmayan şey adres defteri.

Kural net: WebGL2 yolunda invocation'ın kendi indeksi dışında bir yer okuyacaksanız o tampona `.setPBO(true)` demek zorundasınız. WebGPU tarafında bu çağrının hiçbir etkisi yok; API'nin kendi belgesi "yalnızca WebGL için geçerli" diyor.

Demoya da öyle girdi: "eş bağı" seçeneğinde üç durum var. Kapalı, açık, açık-ama-PBO'suz. WebGPU'da üçüncü seçenek ikincisiyle *neredeyse* aynı çalışıyor: `setPBO` orada zaten işlevsiz olduğu için okuma aynı `read_write` tampondan geliyor, ama iki durumun konum çıktıları bit-birebir değil — fark ~2×10⁻⁷ mertebesinde kalıyor, çünkü aynı karede birbirini okuyan invocation'lar arasında bir sıralama garantisi yok. WebGL2'de üçüncü seçenek birincisiyle birebir aynı çalışıyor: checksum bit bit eşleşiyor.

Aynı çağrı iki backend'de iki farklı şey anlatıyor: birinde süs, ötekinde şart.

Bunu ölçüm modunda sayıya bağlıyoruz: her üç yapılandırmayı sabit tohumla, sabit sayıda adım koşturup konum tamponunu geri okuyor ve bir özet değer hesaplıyoruz.

```ts
// src/measure/checksum.ts
/** Konum tamponunun düzen bağımsız özeti: bit deseni toplamı. */
export function positionChecksum(data: Float32Array): number {
  const view = new Uint32Array(data.buffer, data.byteOffset, data.length);
  let h = 0x811c9dc5;
  for (let i = 0; i < view.length; i++) {
    h ^= view[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
```

Geri okuma için `renderer.getArrayBufferAsync(positionBuffer.value)` var. Bir tuzağı da not edeyim: `offset` ve `count` parametreleri dörde bölünebilmek zorunda, değilse fonksiyon hata fırlatıyor.

Beklenen tablo şu; tabloyu doğrulayan şey de eşitliklerin *yerleri*:

| Yapılandırma | WebGPU özeti | WebGL2 özeti |
|---|---|---|
| Eş bağı kapalı | 2.846.883.600 | 2.846.883.600 |
| Eş bağı açık (PBO) | 2.990.562.400 | 614.728.775 |
| Eş bağı açık, PBO yok | 1.607.400.744 | 2.846.883.600 |

Backend'ler arası sayıların birbirini tutmasını beklemiyorum; kayan nokta işlem sırası ve derleyici optimizasyonları farklı. Beklediğim şey sütun içinde: WebGL2 sütununda üçüncü satırın birinci satıra eşit çıkması. Eşitse çöküş kanıtlanmış demektir.

Bir uyarı daha: WebGPU sütunundaki "açık" ve "PBO'suz" satırları koşudan koşuya değişiyor — komşu okuma ile yazma aynı karede birden çok invocation'da çakıştığı için sıralama deterministik değil; yukarıdaki tablo tek bir koşunun görüntüsü. "Kapalı" satırı ise üç koşuda da birebir aynı çıktı, çünkü orada hiç komşu okuması yok.

### WebGL2'de Sessizce Kaybolan Diğer Şeyler

`setPBO` yalnız bir örnek. Emülasyonun sınırları başka yerlerde de var ve hepsi aynı karakterde: kod derleniyor, program çalışıyor, davranış farklı.

| Ne yazdınız | WebGL2'de ne oluyor |
|---|---|
| `workgroupBarrier()` / `storageBarrier()` | GLSL'de yorum satırına derleniyor. Sessiz no-op |
| Atomik işlemler (`atomicAdd` vb.) | GLSL karşılığı yok; geçersiz shader |
| `subgroupSize`, `subgroupIndex` | Konsola hata basılıyor ve `undefined` dönüyor, sonra link hatası |
| `compute(node, [x, y, z])` dizi dispatch | Bir kez uyarı, sonra yalnız `x` kullanılıyor |
| Indirect dispatch | Bir kez uyarı, sonra statik `count`'a düşülüyor |
| Kendi indeksi dışına **yazmak** | Transform feedback buna izin vermiyor |

İlk satır özellikle tehlikeli. Barrier koyduğunuz bir kernel, tanımı gereği invocation'lar arası bir sıralama varsayıyor demektir; o varsayım WebGL2'de karşılıksız kalıyor. Prefix sum, bitonic sort gibi işler tam olarak buraya giriyor.

İki backend'i birlikte hedefliyorsanız pratik kural şu: kernel'ınız yalnız kendi yuvasına yazsın, komşuyu yalnız okusun, barrier'a yaslanmasın. Bu üç kuralın içinde kalan her şey iki tarafta da aynı işi yapıyor.

Bir de fallback'in kendisi hakkında küçük bir uyarı. WebGPU bulunamadığında `WebGPURenderer` konsola `THREE.WebGPURenderer: WebGPU is not available, running under WebGL2 backend.` yazıp WebGL2'ye düşüyor. Ama `forceWebGL: true` verirseniz hiçbir şey basmıyor. Hangi yolda olduğunuzu görmek istiyorsanız kendiniz sormanız gerekiyor:

```ts
// src/app.ts (parça)
const renderer = new WebGPURenderer({
  canvas,
  forceWebGL,
  antialias: false,
  trackTimestamp: options.trackTimestamp ?? true,
});
await renderer.init();

// `forceWebGL: true` HİÇBİR uyarı basmıyor; hangi yolda olduğumuzu kendimiz soruyoruz.
const backend = backendName(renderer);

// src/backendName.ts — `@types/three` bu bayrağı bildirmiyor, sözleşmeyi biz yazıyoruz.
export function backendName(renderer: { backend: unknown }): BackendName {
  const flags = renderer.backend as BackendFlags;
  return flags.isWebGLBackend === true ? "webgl2" : "webgpu";
}
```

Firefox masaüstünde WebGPU hâlâ varsayılan olarak kapalı olduğu için bu satır dekoratif değil; kullanıcılarınızın bir kısmı emülasyon yolunda koşuyor.

### Compute'tan Ekrana: Kopyasız Geçiş

Simülasyon çalışıyor. Çizim tarafı üç satır:

```ts
// src/sim/renderable.ts
import { Sprite, SpriteNodeMaterial } from "three/webgpu";
import { float, vec3 } from "three/tsl";
import type { StorageBufferNode } from "three/webgpu";

export function createParticles(positionBuffer: StorageBufferNode<"vec4">, count: number) {
  const material = new SpriteNodeMaterial({ transparent: true, depthWrite: false });

  // Kopya yok: compute'un yazdığı tamponun ta kendisi vertex girdisi oluyor.
  const position = positionBuffer.toAttribute();
  material.positionNode = position.xyz;
  material.scaleNode = float(0.012);
  material.colorNode = vec3(0.55, 0.78, 1.0).mul(position.w.mul(0.6).add(0.7));

  const particles = new Sprite(material);
  particles.count = count;
  // Konumlar CPU'nun bilmediği bir tamponda; bounding sphere yalan söyler.
  particles.frustumCulled = false;

  return particles;
}
```

`toAttribute()` yeni bir tampon üretmiyor, aynı attribute nesnesini döndürüyor. WebGPU tarafında bu tamponun `STORAGE | VERTEX` bayrakları zaten birlikte verilmişti; compute'un bıraktığı bellek doğrudan vertex girdisi oluyor.

`frustumCulled = false` satırını unutmayın. Sprite'ın sınır küresi geometrisinden hesaplanıyor ve geometri boş; kamerayı biraz oynattığınızda bütün bulut kayboluyor. Ekran kararınca ilk şüpheli shader oluyor; oysa shader gayet iyi, bulut hiç çizilmiyor.

Kare döngüsü de sade:

```ts
// src/app.ts (parça)
/** Bir kare: sabit alt adım sayısı kadar compute, sonra render. */
renderFrame(): number {
  const current = requireSim();
  const start = performance.now();
  for (let i = 0; i < SUBSTEPS; i++) renderer.compute(current.step);
  renderer.render(scene, camera);
  return performance.now() - start;
},

// src/main.ts (parça)
function frame(): void {
  frameId = requestAnimationFrame(frame);

  morphAdvance(); // morphT uniform'unu kare başına sabit adımla sürüyor
  frameMs = app.renderFrame();
  // ... FPS penceresi ve GPU zaman damgası okuması
  hud.update(stats());
}
```

Sabit alt adım sayısı bilinçli. Delta zamanla ölçekleyen bir simülasyon, ölçüm modunda koşudan koşuya farklı sonuç verir; deterministik olsun diye adım sabit.

Başlatmayı bir kez ve `computeAsync` ile yapıyoruz, çünkü backend hazır değilken `compute()` çağırmak konsola uyarı bastırıyor:

```ts
await renderer.init();
await renderer.computeAsync(sim.init);
```

### Makineyi Isıtmamak

Bu serideki her demoda aynı üç korkuluk var: `devicePixelRatio` kelepçesi, çözünürlük ölçekleyici ve bir "Dur/Devam" düğmesi.

```ts
// src/viewport.ts
export const MAX_DPR = 2;

export function backingSize(cssW: number, cssH: number, dpr: number, scale: number) {
  const clampedDpr = Math.min(Math.max(dpr, 1), MAX_DPR);
  const clampedScale = Math.min(Math.max(scale, 0.25), 1);
  return {
    width: Math.max(1, Math.round(cssW * clampedDpr * clampedScale)),
    height: Math.max(1, Math.round(cssH * clampedDpr * clampedScale)),
  };
}
```

```ts
// src/main.ts (parça)
function setRunning(next: boolean): void {
  if (next === running) return;
  running = next;
  toggleButton.textContent = running ? "Dur" : "Devam";
  if (running) frameId = requestAnimationFrame(frame);
  else cancelAnimationFrame(frameId);
}

toggleButton.addEventListener("click", () => setRunning(!running));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) setRunning(false);
});
```

Varsayılan parçacık sayısı 100.000. Düğmeler 100k / 200k / 500k. Bir milyonu koymadım ve bunun sebebi bellek değil: dört tamponun tamamı bir milyonda bile WebGPU'nun varsayılan `maxStorageBufferBindingSize` sınırının çok altında kalıyor. Sebep aşağıdaki tabloda görünecek. Sınır GPU'da değil.

Sayı değiştirmek bütün tamponları ve iki kernel'ı yeniden kurmayı gerektiriyor. `instancedArray` boyutunu sonradan değiştiremiyorsunuz; tampon bir kez oluşturuluyor, kalıcı olmasının bedeli de bu.

### Ölçüm Modu

Demoyu `?measure=1` ile açtığınızda arayüz kapanıyor, arka tampon sabit boyuta kilitleniyor ve sabit tohumla belirlenmiş bir koşu yapılıyor. Sonunda konsola tek satır `MEASURE {json}` düşüyor. Backend'i `?backend=webgpu` veya `?backend=webgl2` ile seçiyorsunuz; ikincisi `forceWebGL: true` demek.

GPU zamanını `trackTimestamp` ile alıyoruz:

```ts
// src/measure/gpuTimer.ts
import type { WebGPURenderer } from "three/webgpu";

export interface Timestamps {
  computeMs: number | null;
  renderMs: number | null;
}

/**
 * Gerçek imza `resolveTimestampsAsync( type = 'render' )` (Renderer.js:2856):
 * aşama ADIYLA isteniyor ve iki aşama ayrı ayrı çözülüyor. Renderer
 * `trackTimestamp: true` ile kurulmamışsa three konsola `warnOnce` basar —
 * onun yerine null döndürüp sütunu boş bırakıyoruz.
 */
export async function readTimestamps(renderer: WebGPURenderer): Promise<Timestamps> {
  if (!hasTimestamps(renderer)) return { computeMs: null, renderMs: null };

  await renderer.resolveTimestampsAsync("compute");
  await renderer.resolveTimestampsAsync("render");

  return {
    computeMs: renderer.info.compute.timestamp,
    renderMs: renderer.info.render.timestamp,
  };
}

export function hasTimestamps(renderer: WebGPURenderer): boolean {
  const backend = renderer.backend as unknown as { trackTimestamp?: boolean };
  return backend.trackTimestamp === true;
}
```

Zaman damgalarına inanırken iki şeyi hatırlamak gerekiyor. Birincisi, tarayıcılar bu sayıları kasten kuantize ediyor; küçük geçişlerde ölçtüğünüz şey gerçek süre değil, en yakın basamak oluyor. Bu yüzden 100k'da compute süresi tek bir basamağa yapışık duruyorsa şaşırmayın. İkincisi, aşama medyanları toplanamıyor; compute medyanı ile render medyanını toplayıp kare süresi elde edemezsiniz.

Ölçüm zamanlayıcı vermezse GPU sütunları boş kalıyor ve tablo başlığı "kare süresi" olarak değişiyor. Ölçmediğimiz bir şeyi ölçmüş gibi etiketlemek, hiç ölçmemekten kötü.

### Sayılar

Önce CPU tarafı. Örnekleme ana iş parçacığında koşuyor ve `npm run bench` bunu Node'da tekrarlıyor:

| Parçacık | CDF (ms) | ns/nokta | MeshSurfaceSampler (ms) | ns/nokta |
|---|---|---|---|---|
| 100.000 | 15,69 | 156,9 | 20,79 | 207,9 |
| 200.000 | 29,02 | 145,1 | 41,49 | 207,5 |
| 500.000 | 76,02 | 152,0 | 105,59 | 211,2 |

CDF kurulumu (üçgen alanlarının kümülatif toplamı) ayrı bir kalem ve nokta sayısından bağımsız: 0,165 ms, 3.968 üçgen için.

İkinci tablo bellek. Dört tampon, hepsi `vec4`:

| Parçacık | Tampon başına | Dört tampon | `vec3` sanılan | Fark |
|---|---|---|---|---|
| 100.000 | 1,6 MB | 6,4 MB | 4,8 MB | 1,6 MB |
| 200.000 | 3,2 MB | 12,8 MB | 9,6 MB | 3,2 MB |
| 500.000 | 8,0 MB | 32,0 MB | 24,0 MB | 8,0 MB |

"`vec3` sanılan" sütunu, dolgu olmasaydı ödeyeceğiniz miktar. `vec3` tampon açarsanız o sütunu değil, komşusunu ödüyorsunuz; sadece dördüncü bileşeni kullanmıyorsunuz.

Üçüncü tablo asıl mesele. Aynı sahne, aynı tohum, iki backend:

| Parçacık | Backend | Compute (ms, medyan) | Render (ms, medyan) | Kare (ms, medyan) |
|---|---|---|---|---|
| 100.000 | WebGPU | 0,131 | 2,16 | 8,3 |
| 100.000 | WebGL2 | 2,97 | 1,66 | 8,3 |
| 200.000 | WebGPU | 0,459 | 4,06 | 8,3 |
| 200.000 | WebGL2 | 5,70 | 3,08 | 16,6 |
| 500.000 | WebGPU | 0,983 | 6,98 | 8,3 |
| 500.000 | WebGL2 | 5,83 | 4,71 | 16,6 |

Dördüncü tablo eş bağının bedeli. WebGL2'de rastgele okuma bedava değil: tamponun her geçişten sonra bir dokuya kopyalanması gerekiyor. WebGPU'da böyle bir kopya yok, okuma tamponun kendisinden.

| Backend | Bağ kapalı | Bağ açık (PBO) | Fark |
|---|---|---|---|
| WebGPU | 0,164 | 0,197 | ≈0 (kuantum içinde) |
| WebGL2 | 2,48 | 2,91 | +0,46 |

Şurada dürüst olayım: bu kopyanın compute geçişi başına mı yoksa kare başına bir kez mi çalıştığını kaynağı okuyarak tam çıkaramadım. Ölçüm iki ihtimali de kapsıyor, çünkü ölçtüğüm şey kare başına toplam compute süresi.

Beşinci tablo morph'un kendisi. Geçiş sırasında ekranda çok şey oluyor; kernel'da hiçbir şey değişmiyor:

| Durum | WebGPU compute (ms) | WebGL2 compute (ms) |
|---|---|---|
| Sabit (morphT = 0) | 0,131 | 3,05 |
| Geçiş ortası (morphT ≈ 0,5) | 0,197 | 2,98 |
| Hedefte (morphT = 1) | 0,131 | 3,12 |

Son olarak, sayı değiştirme maliyeti. Düğmeye bastığınızda iki mesh yeniden örnekleniyor, dört tampon yeniden kuruluyor ve kernel'lar yeniden derleniyor. Ana iş parçacığı bu süre boyunca duruyor:

| Parçacık | Örnekleme (ms) | Tampon + kernel kurulumu (ms) | Toplam donma (ms) |
|---|---|---|---|
| 100.000 | 40,4 | 1,3 | 41,7 |
| 200.000 | 87,2 | 2,2 | 89,3 |
| 500.000 | 226,1 | 6,2 | 231,7 |

Bu tablo, varsayılanın neden 100k olduğunu söyleyen tablo. Soğuk derleme tek gözlem olduğu için kurulum sütununu medyanla değil, ilk koşuyla veriyoruz; ikinci koşuda shader önbelleği devrede.

### Tarayıcısız Doğrulanan Kısım

Ana iddiaların çoğu GPU'ya dokunmadan sınanabiliyor. Shader dökümü Node'da alınıyor, örnekleyici saf TypeScript.

Shader testleri doğrudan yazının tezini kontrol ediyor:

```ts
// test/shaders.test.ts (parça)
import { describe, expect, it } from "vitest";
import {
  buildDumpKernel,
  buildReadOnlyKernel,
  countMatches,
  dumpCompute,
  transformVaryings,
} from "../tools/dumpShaders";

describe("aynı kernel, iki backend", () => {
  it("WGSL kalıcı bir read_write storage buffer üretir", () => {
    const wgsl = dumpCompute(buildDumpKernel({ pbo: true }), false);
    expect(wgsl).toContain("var<storage, read_write>");
  });

  it("WGSL eş okumasını korur", () => {
    const wgsl = dumpCompute(buildDumpKernel({ pbo: true }), false);
    expect(wgsl).toContain("1023u - instanceIndex");
  });

  it("WGSL sınır korumasını kendisi ekler", () => {
    const wgsl = dumpCompute(buildDumpKernel({ pbo: true }), false);
    expect(wgsl).toMatch(/if \( instanceIndex >= .+ \) \{ return; \}/);
  });

  it("GLSL rastgele okumayı texelFetch ile yapar (PBO açıkken)", () => {
    const glsl = dumpCompute(buildDumpKernel({ pbo: true }), true);
    expect(glsl).toContain("texelFetch");
  });

  it("PBO kapalıyken texelFetch YOK: sessiz çöküşün regresyon testi", () => {
    const glsl = dumpCompute(buildDumpKernel({ pbo: false }), true);
    expect(glsl).not.toContain("texelFetch");
  });

  it("iki döküm de aynı sürümden çıkar", () => {
    expect(dumpCompute(buildDumpKernel({ pbo: true }), false)).toContain("r185");
    expect(dumpCompute(buildDumpKernel({ pbo: true }), true)).toContain("r185");
  });
});
```

Beşinci test yazının en değerli testi. Bir gün three'nin bir sürümü `setPBO` olmadan da rastgele okumayı çözerse o test kırmızı yanacak ve bu iyi bir haber olacak. Şu an kırmızı yanmasını istediğim şey ise sessizliğin kendisi.

Örnekleyici tarafında Arşimet hakemlik yapıyor:

```ts
// test/surfaceSampler.test.ts (parça)
import { describe, expect, it } from "vitest";
import { BufferAttribute, BufferGeometry, PlaneGeometry, SphereGeometry } from "three";
import { Vector3 } from "three";
import { buildSurfaceSampler } from "../src/sampling/surfaceSampler";
import { buildUniformTriangleSampler } from "../src/sampling/uniformTriangleSampler";
import { mulberry32 } from "../src/sampling/rng";

/**
 * Arşimet'in şapka kutusu teoremi: kürenin iki paralel düzlem arasında kalan
 * kuşağının alanı 2π·r·h. `y > 0.8` kepi için h = 0,2, toplam 4π·r².
 * Oran = 2π·1·0,2 / 4π = h / (2r) = 0,1.
 */
const POLAR_CAP_ANALYTIC = 0.1;

describe("alan-ağırlıklı örnekleme", () => {
  it("toplam alan 4π'ye ALTTAN yakınsar", () => {
    const coarse = buildSurfaceSampler(new SphereGeometry(1, 16, 8)).totalArea;
    const fine = buildSurfaceSampler(new SphereGeometry(1, 128, 64)).totalArea;
    const exact = 4 * Math.PI;

    expect(coarse).toBeLessThan(exact);
    expect(fine).toBeLessThan(exact);
    expect(exact - fine).toBeLessThan(exact - coarse);
    expect(fine).toBeGreaterThan(exact * 0.999);
  });

  it("kutup kepine düşen oran Arşimet'in verdiği sayıya yaklaşır", () => {
    const sampler = buildSurfaceSampler(new SphereGeometry(1, 64, 32));
    const rng = mulberry32(42);
    const p = new Vector3();
    const N = 200_000;

    let cap = 0;
    for (let i = 0; i < N; i++) {
      sampler.sample(rng, p);
      if (p.y > 0.8) cap++;
    }

    // 2π·r·h / 4π·r² = (1 - 0.8) / 2 = 0.1
    expect(cap / N).toBeGreaterThan(0.095);
    expect(cap / N).toBeLessThan(0.105);
  });

  it("aynı tohum aynı bulutu verir", () => {
    const sampler = buildSurfaceSampler(new SphereGeometry(1, 32, 16));
    const a = new Vector3();
    const b = new Vector3();
    sampler.sample(mulberry32(7), a);
    sampler.sample(mulberry32(7), b);
    expect(a.equals(b)).toBe(true);
  });

  it("üçgen başına DÜZGÜN seçim kutupları şişiriyor: analitik sayının çok üstünde", () => {
    const sampler = buildUniformTriangleSampler(new SphereGeometry(1, 64, 32));
    const rng = mulberry32(42);
    const p = new Vector3();
    const N = 200_000;

    let cap = 0;
    for (let i = 0; i < N; i++) {
      sampler.sample(rng, p);
      if (p.y > 0.8) cap++;
    }

    // Beklenti testi: yanlış örnekleyici 0,1 bandını AŞMALI.
    expect(cap / N).toBeGreaterThan(0.15);
    expect(cap / N).toBeGreaterThan(POLAR_CAP_ANALYTIC * 1.5);
  });
});
```

Bunların yanında `mulberry32`'nin bilinen dizisi, binary search'ün sınır durumları (ilk üçgen, son üçgen, tam kümülatif sınıra denk gelen değer), barycentric katlamanın üçgen dışına nokta üretmemesi, `positionChecksum`'ın aynı girdide aynı çıktıyı vermesi ve `backingSize`'ın kelepçeleri var.

Hiçbir test dosyası `document`, `navigator` ya da `WebGL2RenderingContext` referansı içermiyor.

Şunu da açık söyleyeyim: bu testlerin hiçbiri ekranda güzel bir morph olduğunu kanıtlamıyor. Onun için `npm run dev` çalıştırıp düğmeye basmak gerekiyor.

### Özetle:

1. `instancedArray(count, type)` bir `StorageInstancedBufferAttribute` üretiyor. `StaticDrawUsage` olduğu ve sürümü artmadığı için kare başına yeniden yüklenmiyor; veri GPU'da kalıyor.
2. WebGPU tarafında bu tampon `STORAGE | VERTEX` bayraklarıyla oluşturuluyor. `toAttribute()` aynı nesneyi döndürüyor, compute'tan render'a kopya yok.
3. Mesh yüzeyinden nokta üretmek iki adım: alanla orantılı üçgen seçimi (kümülatif toplam + binary search) ve üçgen içinde barycentric katlama. Kümülatif diziyi `Float64Array` tutun.
4. Üçgenleri düzgün olasılıkla seçmek küre üzerinde kutupları parlatıyor. Arşimet'in şapka kutusu teoremi doğru cevabı analitik veriyor: `y > 0,8` bölgesi alanın tam olarak %10'u.
5. Toplam alanın `4π`'ye alttan yakınsaması bedava bir doğrulama. İçe çizilmiş çokyüzlünün alanı küreden büyük olamaz; sapma tek yönlü küçülür.
6. `MeshSurfaceSampler` hazır ve iyi; elle yazmanın karşılığı hız ve tam kontrol. `setWeightAttribute` keskin maske vermiyor, çünkü ağırlık köşe başına ve sınırı kesen üçgenler ortalamayla seçiliyor.
7. `instancedArray(n, "vec3")` GPU'da eleman başına 16 bayt yer kaplıyor; WGSL paketlenmiş `vec3` desteklemiyor ve three dolduruyor. Baştan `vec4` kullanıp dördüncü bileşene faz/ömür koyun.
8. Dolgunun yan etkisi sinsi: three `attribute.itemSize`'ı yerinde 3'ten 4'e çeviriyor — ama yalnız WebGPU'da; WebGL2'de ölçülen `vec3` tampon 3'te kalıyor, dolgu yok. Bayt hesabını `itemSize`'dan türeten kod, WebGPU'da ilk kareden sonra başka sonuç veriyor.
9. WebGL2'de compute *var*: three onu transform feedback ile emüle ediyor, rastgele okumayı da tamponu dokuya kopyalayıp `texelFetch` ile yapıyor. Elle position texture ping-pong'u yazmaya gerek yok.
10. Rastgele indeksle okuyacaksanız o tampona `.setPBO(true)` deyin. Yoksa okuma sessizce parçacığın kendi değerine çöküyor: hata yok, uyarı yok, sonuç yanlış. WebGPU'da bu çağrının etkisi yok.
11. Kernel'ınız yalnız kendi indeksine yazsın. Transform feedback başka bir yuvaya yazamaz; iki backend'i birden hedefliyorsanız bu bir kural.
12. `workgroupBarrier` WebGL2'de yorum satırına derleniyor, atomiklerin karşılığı yok, subgroup değişkenleri bozuk shader üretiyor. Barrier'a yaslanan algoritmalar taşınabilir değil.
13. Sınır korumasını (`if (instanceIndex >= count) return;`) TSL kendisi üretiyor. Ham WebGPU'da elle yazdığımız `Math.ceil` grup hesabı da soyutlamanın içinde kaldı.
14. `forceWebGL: true` hiçbir uyarı basmıyor. Hangi yolda olduğunuzu `renderer.backend.isWebGLBackend` ile sorun ve HUD'a yazın.
15. GPU'dan konum geri okumak için `getArrayBufferAsync` var; `offset` ve `count` dörde bölünebilmek zorunda.
16. Sprite bulutunda `frustumCulled = false` şart. Konumlar CPU'nun görmediği bir tamponda olduğu için sınır küresi yalan söylüyor ve bulut kameranın belli açılarında tamamen kayboluyor.

Proje iki komutla yaşıyor: `npm run dev` demoyu açıyor, `npm run bench` Node tarafındaki örnekleme ve shader döküm ölçümlerini alıyor. Adrese `?measure=1&backend=webgl2` eklerseniz emülasyon yolunun ölçüm koşusunu görüyorsunuz.

Bu yazıya başlarken pahalı olacağını sandığım şey morph'un kendisiydi. Geçiş sırasında her parçacık iki hedef arasında interpolasyon yapıyor, easing hesaplıyor, eşine bakıyor; kare süresinin oradan bir tık yükselmesini bekliyordum.

Yükselmedi. Sabit hâlde 0,131 ms, geçişin tam ortasında 0,197 ms. Sebebi bariz, sonradan: kernel dallanmıyor. `mix` her karede zaten çalışıyor, `morphT` sıfır olsa da bir olsa da aynı komutlar koşuyor. Ekranda gördüğünüz "geçiş", GPU için hiç var olmayan bir olay.

Bedel başka yerde duruyordu. Parçacık sayısını 500 bine çeken düğmeye bastığım anda sayfa 231,7 ms boyunca donuyor: iki mesh yeniden örnekleniyor, dört tampon yeniden kuruluyor.

Mahallede yaşamak bedava; pahalı olan onu kurmak. İki mesh arasında parçacık taşımanın faturası, morph daha başlamadan ödeniyor. 🧬
