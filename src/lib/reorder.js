/**
 * Bir elemanı listede başka bir konuma taşır ve YENİ dizi döndürür.
 *
 * Saf tutulmasının sebebi: sürükle-bırak arayüzü tarayıcı olaylarına bağlı,
 * doğrudan test edilmesi zor. Sıralama mantığı burada ayrı durunca uç
 * durumlar (başa/sona taşıma, aynı yere bırakma) tek başına sınanabilir.
 */
export function tasi(liste, kaynak, hedef) {
  const son = liste.length - 1;
  if (kaynak < 0 || hedef < 0 || kaynak > son || hedef > son) return liste;
  if (kaynak === hedef) return liste;

  const kopya = [...liste];
  const [tasinan] = kopya.splice(kaynak, 1);
  kopya.splice(hedef, 0, tasinan);
  return kopya;
}
