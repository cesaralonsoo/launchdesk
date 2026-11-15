// LaunchDesk v7 — real, sourced sample runs (demo mode and the prototype). Owner: WS-INTEL.
//
// HONESTY: every `source` below is a page WS-INTEL actually opened on 2026-11-15 (url, title as shown on the page or
// in the PDF, domain, access date). A finding quotes only what that page says. Everything else is kind "estimate"
// (or a strength / risk without a source) and carries its basis. No URL, figure, name or quote is written from memory.
// The analysis (impacts, scalability parts, strengths, next steps) is our judgement, not a claim of fact.
// Scores are never typed here: server/v7.ts buildReport() computes them from these findings.
import { applySteer, buildReport, enforceSourceRule, finishWork, hire, paced, weigh, type Analyst, type AnalystRole, type AnalystWork, type Finding, type JudgeDraft, type ResultsV7, type SourceRef, type SteerPlan, type SteerResult } from "./v7.js";

const ACCESSED = "2026-11-15";
const src = (url: string, title: string): SourceRef => ({ url, title, domain: new URL(url).hostname.replace(/^www\./, ""), accessed: ACCESSED });

/** Every page used by the samples (DATA.md lists them). */
export const SOURCES = {
  tmbStations: src("https://noticies.tmb.cat/transport/vols-saber-quines-son-estacions-amb-mes-menys-usuaris-de-xarxa-de-metro", "Vols saber quines són les estacions amb més i menys usuaris de la xarxa de metro?"),
  araJourneys: src("https://en.ara.cat/society/tmb-s-public-transport-exceeds-700-million-journeys-in-year-for-the-first-time_25_5612998.html", "TMB's public transport exceeds 700 million journeys in a year for the first time"),
  tmbParadeta: src("https://noticies.tmb.cat/sala-de-premsa/tmb-estrena-primera-paradeta-metro-lestacio-de-sagrera-de-linia-1", "TMB estrena la primera 'paradeta' del metro a l'estació de La Sagrera de la línia 1"),
  tmbUnit: src("https://www.tmb.cat/documents/20182/167305/05+Fitxa+T%C3%A8cnica+Vall+d%27Hebron_L5_CAST.pdf/b7b6c0c4-6b6d-4ecc-bc82-1f72d4d9bf35", "Ficha técnica licitación locales comerciales · Vall d'Hebron (L5)"),
  tmbStands: src("https://www.tmb.cat/en/business-and-companies/commercial-areas/stands", "Stands | Transports Metropolitans de Barcelona"),
  timeoutCoffee: src("https://www.timeout.es/barcelona/es/noticias/por-que-es-tan-caro-un-buen-cafe-con-leche-en-barcelona-051124", "¿Por qué es tan caro un buen café con leche en Barcelona?"),
  araCortado: src("https://es.ara.cat/sociedad/mapa-cortado-barcelona-caro_1_5877843.html", "El mapa del cortado en Barcelona: ¿dónde es más caro?"),
  wcpSyra: src("https://www.worldcoffeeportal.com/news/spains-syra-coffee-seeking-to-reach-100-stores-by-2026/", "Spain's Syra Coffee seeking to reach 100 stores by 2026"),
  wcpSpain: src("https://www.worldcoffeeportal.com/analysis/the-ecs-coho-series-the-spanish-branded-coffee-shop-market-in-focus/", "The ECS + COHO Series: The Spanish branded coffee shop market in focus"),
  // Tique (market-trader tickets, Spain)
  legaltoday: src("https://www.legaltoday.com/actualidad-juridica/noticias-de-derecho/nueva-prorroga-verifactu-no-sera-obligatorio-hasta-2027-para-sociedades-y-otros-contribuyentes-2025-12-04/", "Nueva prórroga: Verifactu no será obligatorio hasta 2027 para Sociedades y otros contribuyentes"),
  wwwhatsnew: src("https://wwwhatsnew.com/2026/10/06/hacienda-verifactu-octubre-2028-aplazamiento-factura-electronica-2026", "Hacienda retrasa Verifactu hasta octubre de 2028: el cuarto aplazamiento en tres años"),
  aeatApp: src("https://sede.agenciatributaria.gob.es/Sede/ayuda/consultas-informaticas/presentacion-declaraciones-ayuda-tecnica/aplicacion-gratuita-verifactu-aeat.html", "Aplicación gratuita VERI*FACTU de la AEAT"),
  oie: src("https://www.oie.es/programas-verifactu/", "Comparador de programas VeriFactu para autónomos y pymes"),
  invoo: src("https://invoo.es/es/blog/guias/verifactu-aplazado-2027-que-cambia-autonomos/", "Verifactu: aplazamiento previsto a octubre de 2028"),
  forbesReta: src("https://forbes.es/economia/883419/upta-celebra-el-record-de-autonomos-en-febrero-y-el-avance-hacia-actividades-con-mayor-valor-anadido/", "UPTA celebra el récord de autónomos en febrero y el avance hacia actividades con mayor valor añadido"),
  juntaMarkets: src("https://juntadeandalucia.es/presidencia/portavoz/resources/files/2015/2/27/1425031602787Plan%20Activaci%C3%B3n%20Comercio%20Ambulante%202015-2017.pdf", "Plan de Activación del Comercio Ambulante en Andalucía 2015-2017"),
  // Gràcia sourdough bakery
  euronewsBread: src("https://es.euronews.com/2025/11/08/el-pan-desaparece-de-la-mesa-espanola-del-kilo-diario-a-la-extincion-cultural", "El pan desaparece de la mesa española: del kilo diario a la extinción cultural"),
  lexpressBakery: src("https://lexpress-franchise.com/es/articulos/situacion-sector-panaderias-espana/", "Situación del sector de las panaderías en España en 2026"),
  puratosSurvey: src("https://www.corresponsables.com/actualidad/crisis-de-relevo-en-la-panaderia-artesanal-el-45-ve-dificil-encontrar-personal-en-la-proxima-decada/", "Crisis de relevo en la panadería artesanal: el 45% ve difícil encontrar personal en la próxima década"),
  sourdough: src("https://www.interempresas.net/Alimentaria/581665-La-masa-madre-lidera-el-sector-de-la-panaderia-con-un-crecimiento-global-del-40-por.html", "La masa madre lidera el sector de la panadería con un crecimiento global del 40% para 2025"),
  // Ronda (group dog walks, Madrid)
  madridDogs: src("https://www.elespanol.com/mascotario/20260129/perros-viven-hogares-madrid-total-andalucia/1003744103943_0.html", "320.000 perros viven en hogares de Madrid: más de un 10% del total, pero un 50% menos que en Andalucía"),
  consumerApps: src("https://www.consumer.es/?p=295762", "Cinco apps para encontrar paseadores de perros"),
  ministryFaq: src("https://www.dsca.gob.es/sites/default/files/derechos-sociales/preguntas-respuestas-frecuentes-ley-proteccion-derechos-y-bienestar-animales.pdf", "Ley de protección de los derechos y el bienestar de los animales: preguntas y respuestas (PDF)"),
  vozpopuli: src("https://www.vozpopuli.com/actualidad/ley-bienestar-animal-pendiente-2025-sd.html", "Ley de Bienestar Animal: ¿qué está pendiente para 2025?"),
} as const;

type F = Omit<Finding, "id" | "analyst" | "t">;
const S = SOURCES;

export type V7SampleKey = "coffee" | "saas" | "bakery" | "dog";
/** A prepared CEO note: matched by keywords in demo mode, honest (new findings are sourced or labelled estimates). */
export interface PreparedSteer {
  key: string;
  match: RegExp;
  note: string;
  plan: SteerPlan;
  fresh: Partial<Record<AnalystRole, { findings: F[]; headline?: string; replaces?: Record<number, string> }>>;
  judge: (base: JudgeDraft) => JudgeDraft;
  why?: Partial<Record<string, string>>;
}
export interface V7Sample {
  key: V7SampleKey;
  id: string;
  idea: string;
  title: string;
  match: RegExp;
  roster: Array<{ role: AnalystRole; mission: string; why: string }>;
  work: Partial<Record<AnalystRole, { headline: string; findings: F[] }>>;
  judge: JudgeDraft;
  steers: PreparedSteer[];
}

// ─────────────────────────────────────────────────────────── Pausa · specialty coffee at a Barcelona metro exit

const coffee: V7Sample = {
  key: "coffee",
  id: "pausa",
  idea: "A specialty coffee kiosk at a Barcelona metro exit, €3 flat whites for commuters",
  title: "Metro coffee kiosk",
  match: /\b(coffee|caf[eé]|espresso|flat white|kiosk|barista)\b/,
  roster: [
    { role: "competition", mission: "Who already sells commuters coffee near Barcelona metro exits", why: "Commuters already buy coffee somewhere every morning" },
    { role: "market", mission: "How much money moves through metro-exit morning coffee", why: "A kiosk lives or dies on daily cups" },
    { role: "location", mission: "Which station, what rent, and how to get in", why: "A kiosk is only as good as its exit" },
    { role: "viability", mission: "Strengths, weak points and what could kill the kiosk", why: "Every idea gets a viability check" },
  ],
  work: {
    competition: {
      headline: "Crowded on price; the early specialty slot is the gap.",
      findings: [
        { kind: "competitor", text: "Syra Coffee runs 41 specialty shops from Barcelona and aims for 100 by 2026.", display: "41 shops", value: 41, unit: "shops", source: S.wcpSyra, competitor: { name: "Syra Coffee", named: true, note: "Small specialty shops, expanding fast" }, impact: 0 },
        { kind: "number", text: "A cortado's median price in Barcelona is €1.70, from 836 bar prices.", display: "€1.70", value: 1.7, unit: "€", source: S.araCortado, competitor: { name: "Neighbourhood bars", named: false, price: "€1.70 cortado", note: "Cheap, everywhere, average coffee" }, impact: -1 },
        { kind: "competitor", text: "McCafé (539) and Starbucks (181) lead Spain's branded coffee shops.", display: "539 · 181", source: S.wcpSpain, competitor: { name: "McCafé and Starbucks", named: true, note: "Big brands, fast, generic coffee" }, impact: -1 },
        { kind: "estimate", text: "Specialty cafés near exits rarely open before 8; the 7–9 am slot looks thin.", basis: "Our read of typical opening hours; count it", impact: 1 },
      ],
    },
    market: {
      headline: "Huge, growing flow of people who already pay for coffee.",
      findings: [
        { kind: "number", text: "TMB carried a record 700.5 million journeys in 2025, up 2.4% on 2024.", display: "700.5M", value: 700.5, unit: "M journeys", source: S.araJourneys, impact: 1 },
        { kind: "number", text: "Spain's branded coffee shops grew 3% to 2,215 in the year to April 2025.", display: "2,215", value: 2215, unit: "outlets", source: S.wcpSpain, impact: 1 },
        { kind: "fact", text: "New specialty cafés in Barcelona charge €2.50–2.70 for a café con leche.", display: "€2.50–2.70", source: S.timeoutCoffee, impact: 1 },
      ],
    },
    location: {
      headline: "Diagonal has the flow; station units are cheap but tendered.",
      findings: [
        { kind: "number", text: "Diagonal had 16.2 million metro users in 2024, the network's second-busiest station.", display: "16.2M", value: 16.2, unit: "M users", source: S.tmbStations, impact: 2 },
        { kind: "fact", text: "TMB tendered a 73.76 m² unit at Vall d'Hebron: €8,400 a year rent plus €900 upkeep.", display: "€8,400 / yr", value: 8400, unit: "€ a year", source: S.tmbUnit, impact: 1 },
        { kind: "risk", text: "Station units are let by public tender, so TMB sets the timing, not you.", source: S.tmbUnit, impact: -1 },
        { kind: "number", text: "That unit's weekday counts: 458 entries an hour at 8–9 am; the peak is 2–3 pm (732).", display: "458 / h", value: 458, unit: "entries 8–9 am", source: S.tmbUnit, impact: -1 },
      ],
    },
    viability: {
      headline: "Demand is real; margins and a morning-only plan are the risk.",
      findings: [
        { kind: "strength", text: "Specialty coffee demand has grown since the pandemic, a Barcelona roaster tells Time Out.", source: S.timeoutCoffee, impact: 1 },
        { kind: "risk", text: "Green coffee costs jumped: Time Out reported the New York price up 45% in 2024.", display: "+45%", source: S.timeoutCoffee, impact: -1 },
        { kind: "risk", text: "TMB's counts peak at 2–3 pm, not 8–9 am: a morning-only kiosk misses its busiest hour.", display: "732 / h at 2 pm", source: S.tmbUnit, impact: -1 },
      ],
    },
  },
  judge: {
    verdictLine: "Test it before any lease: the flow is proven, the kiosk economics are not.",
    scalability: {
      parts: { Reach: 5, Repeatable: 6, "Margins at scale": 4, "Founder-free": 4, "Digital leverage": 2 },
      reach: "City",
      why: "Each kiosk is one exit and one barista; growth means more stations, not more reach.",
      wouldScale: ["A second stand in another busy interchange", "Online bean subscriptions for regulars", "A barista who runs the morning without you"],
    },
    strengths: [
      { text: "Diagonal moves 16.2 million people a year past one exit.", finding: "location-0" },
      { text: "Record metro traffic: 700.5 million journeys in 2025.", finding: "market-0" },
      { text: "Commuters already pay €2.50–2.70 for good coffee.", finding: "market-2" },
    ],
    weaknesses: [
      { text: "Bars sell a €1.70 cortado on every corner.", finding: "competition-1" },
      { text: "Coffee costs are volatile; the 2024 spike squeezed margins.", finding: "viability-1" },
      { text: "Station units come by tender, on TMB's calendar.", finding: "location-2" },
    ],
    nextSteps: ["Count exits at Diagonal at 8 am and 2 pm on two weekdays", "Ask TMB commercial about a temporary stand", "Sell from a cart for two mornings at €3"],
    pivot: { idea: "Start as a temporary stand at Diagonal, not a fixed kiosk", why: "Tests demand for months without a tender or fit-out" },
  },
  steers: [
    {
      key: "office",
      match: /\b(office|offices|worker|workers|commuter|commuters|professionals|tourist|tourists|stand|pop-?up|cart)\b/,
      note: "Focus on office workers, not tourists, and start as a stand.",
      plan: { ack: "Got it. Re-checking the station and the risks for office commuters.", rerun: ["location", "viability"], hire: [], drop: [] },
      fresh: {
        location: {
          headline: "A temporary TMB stand is the cheapest way in.",
          findings: [{ kind: "fact", text: "TMB rents temporary stands in a few high-traffic stations, for months at a time.", source: S.tmbStands, impact: 1 }],
        },
        viability: {
          headline: "A stand removes the fit-out; weekday trade still decides.",
          findings: [{ kind: "strength", text: "A stand skips the fit-out: start-up money drops to a cart and a machine lease.", basis: "No premises works; typical cart set-up", impact: 1 }],
          replaces: { 0: "viability-2" },
        },
      },
      judge: (b) => ({
        ...b,
        verdictLine: "Closer: a weekday stand at Diagonal tests office demand without a lease.",
        nextSteps: ["Email TMB commercial for a stand at Diagonal", "Count 7–9 am office commuters on two weekdays", "Pre-sell 100 weekday flat whites before the stand opens"],
      }),
      why: { "factor:location": "TMB stands give a way in without a tender", "factor:viability": "No fit-out: less money at risk" },
    },
    {
      key: "online",
      match: /\b(online|beans?|subscription|subscriptions|delivery|web|e-?commerce|ship)\b/,
      note: "Could we also sell our beans online to regulars?",
      plan: { ack: "Good lever. Re-checking the money and how far it can reach.", rerun: ["market"], hire: [], drop: [] },
      fresh: {
        market: {
          headline: "Beans online add sales that don't need the morning queue.",
          findings: [{ kind: "estimate", text: "Bean bags for regulars add sales that don't depend on the 7 am queue.", basis: "Common add-on for specialty coffee bars", impact: 1 }],
        },
      },
      judge: (b) => ({
        ...b,
        scalability: { ...b.scalability, parts: { ...b.scalability.parts, "Digital leverage": 4 }, why: "Still one stand per exit, but beans online reach regulars anywhere in the city." },
      }),
      why: { scalability: "Online beans add digital reach" },
    },
  ],
};

// ─────────────────────────────────────────────────────────── Tique · Verifactu tickets for market traders (scales)

const saas: V7Sample = {
  key: "saas",
  id: "tique",
  idea: "A phone app that issues Verifactu-ready tickets and invoices for Spanish market traders, €6 a month",
  title: "Phone tickets for market traders",
  match: /\b(verifactu|invoice|invoices|invoicing|ticket|tickets|factura|facturas|market traders?|mercadillos?|saas|software)\b/,
  roster: [
    { role: "competition", mission: "Who already sells Verifactu invoicing, and at what price", why: "Billing software is a crowded shelf" },
    { role: "market", mission: "How many traders could pay, and how much", why: "Subscriptions live on headcount times price" },
    { role: "regulation", mission: "What the law forces, and when", why: "Verifactu deadlines create the demand" },
    { role: "tech", mission: "Can a phone app issue compliant tickets at a stall", why: "Software must be built and certified" },
    { role: "viability", mission: "Strengths, weak points and what kills it", why: "Every idea gets a viability check" },
  ],
  work: {
    competition: {
      headline: "Cheap rivals everywhere; nobody owns tickets at the stall.",
      findings: [
        { kind: "competitor", text: "Hacienda's own Verifactu app is free, but cannot issue simplified tickets.", display: "€0", source: S.aeatApp, competitor: { name: "AEAT free Verifactu app", named: true, price: "€0", note: "Full invoices only, no tickets" }, impact: 1 },
        { kind: "number", text: "Verifactu invoicing apps cost €4.99–17 a month: Anfix, Holded €15, Quipu €17.", display: "€4.99–17", source: S.oie, impact: -1 },
        { kind: "competitor", text: "Invoo sells Verifactu invoicing to the self-employed at €10.90 a month.", display: "€10.90", source: S.invoo, competitor: { name: "Invoo", named: true, price: "€10.90 / month", note: "General invoicing, not built for stalls" }, impact: -1 },
      ],
    },
    market: {
      headline: "Millions of self-employed; traders are a reachable first niche.",
      findings: [
        { kind: "number", text: "3,419,873 self-employed were registered in Spain at the end of February 2026.", display: "3.42M", value: 3419873, unit: "self-employed", source: S.forbesReta, impact: 1 },
        { kind: "number", text: "Andalusia alone had nearly 900 street markets with about 42,000 stalls (2013 census).", display: "42,000 stalls", value: 42000, unit: "stalls", source: S.juntaMarkets, impact: 1 },
        { kind: "estimate", text: "If 1% of Andalusia's 42,000 stalls paid €6 a month: about €30k a year.", display: "≈ €30k / yr", basis: "420 stalls × €6 × 12 months", impact: 0 },
      ],
    },
    regulation: {
      headline: "The law creates demand, but the date keeps moving.",
      findings: [
        { kind: "fact", text: "Verifactu becomes mandatory for the self-employed on 1 July 2027 (RDL 15/2025).", display: "1 Jul 2027", source: S.legaltoday, impact: 2 },
        { kind: "risk", text: "Hacienda announced a fourth delay, to October 2028; it is not yet law.", display: "Oct 2028?", source: S.wwwhatsnew, impact: -2 },
      ],
    },
    tech: {
      headline: "Buildable on a phone; compliance work is the long pole.",
      findings: [
        { kind: "fact", text: "Records in Hacienda's free app can't be exported to other billing software.", source: S.aeatApp, impact: 1 },
        { kind: "strength", text: "A phone plus a Bluetooth ticket printer covers a stall; no till needed.", basis: "Common mobile point-of-sale set-up", impact: 1 },
        { kind: "risk", text: "Billing software needs a producer's compliance statement before it is sold.", basis: "Our reading of RD 1007/2023; verify with an adviser", impact: -1 },
      ],
    },
    viability: {
      headline: "Sharp wedge, thin price; the free app is the real rival.",
      findings: [
        { kind: "strength", text: "Clear wedge: tickets from a phone, the one job the free app can't do.", basis: "AEAT app limits plus how stalls sell", impact: 2 },
        { kind: "risk", text: "UPTA estimates Hacienda's free app already covers about 80% of the self-employed.", display: "≈ 80%", source: S.wwwhatsnew, impact: -1 },
        { kind: "risk", text: "Some traders' special VAT regimes may not require tickets; check before selling.", basis: "Unverified: VAT regimes vary by trader", impact: -1 },
      ],
    },
  },
  judge: {
    verdictLine: "Worth building narrow: tickets for stalls, sold through market associations.",
    scalability: {
      parts: { Reach: 9, Repeatable: 9, "Margins at scale": 8, "Founder-free": 7, "Digital leverage": 9 },
      reach: "Country",
      why: "Software: the same app serves a stall in Seville or Bilbao at almost no extra cost.",
      wouldScale: ["Card payments on the same phone", "Bookkeeping export for gestorías", "Other Verifactu-bound trades: food trucks, fairs"],
    },
    strengths: [
      { text: "The free app can't issue tickets: that is the gap.", finding: "competition-0" },
      { text: "Verifactu is law, with a fixed date for the self-employed.", finding: "regulation-0" },
      { text: "3.42 million self-employed, 42,000 stalls in one region.", finding: "market-1" },
    ],
    weaknesses: [
      { text: "The deadline keeps slipping: October 2028 is announced.", finding: "regulation-1" },
      { text: "Rivals already sell from €4.99 a month.", finding: "competition-1" },
      { text: "Most self-employed may settle for the free app.", finding: "viability-1" },
    ],
    nextSteps: ["Interview 15 stallholders at two weekly markets", "Ask one market association to trial it", "Confirm which VAT regimes must issue tickets"],
    pivot: { idea: "Sell through market associations as a group plan", why: "Lowers acquisition cost and fixes the price war" },
  },
  steers: [
    {
      key: "associations",
      match: /\b(association|associations|asociaci[oó]n|group|bundle|council|ayuntamiento|b2b)\b/,
      note: "Sell to market associations, not one trader at a time.",
      plan: { ack: "Good call. Re-checking competition and money for association deals.", rerun: ["competition", "market"], hire: [], drop: [] },
      fresh: {
        market: {
          headline: "One association deal can bring a whole market at once.",
          findings: [{ kind: "estimate", text: "One association deal can sign dozens of stalls in a single meeting.", basis: "Markets are organised by association", impact: 1 }],
        },
      },
      judge: (b) => ({ ...b, verdictLine: "Build it narrow and sell it by association, not stall by stall." }),
      why: { "factor:market": "Group deals cut the cost of each customer" },
    },
  ],
};

// ─────────────────────────────────────────────────────────── Gràcia sourdough bakery (stays a neighbourhood shop)

const bakery: V7Sample = {
  key: "bakery",
  id: "forn",
  idea: "A neighbourhood sourdough bakery in Gràcia, Barcelona, €4.50 loaves, six mornings a week",
  title: "Sourdough bakery in Gràcia",
  match: /\b(bakery|bakeries|panader[ií]a|loaf|loaves|forn|bakehouse)\b/,
  roster: [
    { role: "competition", mission: "Who already sells bread on these streets", why: "Bread is sold on every block" },
    { role: "market", mission: "Is bread money growing or shrinking", why: "A bakery needs daily repeat buyers" },
    { role: "viability", mission: "Strengths, weak points and what kills it", why: "Every idea gets a viability check" },
  ],
  work: {
    competition: {
      headline: "Thousands of bakeries and supermarket bread compete on habit.",
      findings: [
        { kind: "number", text: "Spain has 11,000–11,500 artisan bakeries with their own workshop.", display: "11,000+", source: S.lexpressBakery, impact: 0 },
        { kind: "competitor", text: "Supermarket bake-off bread: cheaper, open later, on every block.", competitor: { name: "Supermarket bake-off bread", named: false, note: "Cheap, convenient, not sourdough" }, basis: "Typical Barcelona high street", impact: -1 },
        { kind: "number", text: "36% of artisan bakers name chains and supermarkets as a main worry.", display: "36%", source: S.puratosSurvey, impact: -1 },
      ],
    },
    market: {
      headline: "Less bread overall, more sourdough: a premium niche.",
      findings: [
        { kind: "number", text: "Bread demand fell to 27.82 kg a person in 2025, from 34.9 kg in 2015.", display: "27.82 kg", value: 27.82, unit: "kg a person", source: S.euronewsBread, impact: -1 },
        { kind: "number", text: "Spending on bread reached €3,378 million in 2024 (Mercasa data).", display: "€3,378M", value: 3378, unit: "€M", source: S.lexpressBakery, impact: 1 },
        { kind: "number", text: "A Puratos study of 18,000 people expects sourdough consumption to grow 40% in 2025.", display: "+40%", source: S.sourdough, impact: 1 },
        { kind: "estimate", text: "At €4.50 a loaf and 120 loaves a day, a shop takes about €14k a month.", display: "≈ €14k / mo", basis: "120 × €4.50 × 26 days; revenue, not profit", impact: 0 },
      ],
    },
    viability: {
      headline: "A good craft business, but hard to staff and hard to copy.",
      findings: [
        { kind: "risk", text: "72% of artisan bakers struggled to hire skilled staff last year.", display: "72%", source: S.puratosSurvey, impact: -1 },
        { kind: "risk", text: "About 600 bakeries close in Spain every year, according to ASEMAC.", display: "≈ 600 / yr", source: S.puratosSurvey, impact: -1 },
        { kind: "strength", text: "Sourdough keeps three to four days, so fewer loaves go to waste.", basis: "Typical shelf life of naturally leavened bread", impact: 1 },
        { kind: "strength", text: "Weekend pre-order boxes let you bake to order before renting a shop.", basis: "Common way small bakers start", impact: 1 },
      ],
    },
  },
  judge: {
    verdictLine: "Not as a shop yet: bread is shrinking and bakers are scarce. Test weekend boxes first.",
    scalability: {
      parts: { Reach: 2, Repeatable: 4, "Margins at scale": 3, "Founder-free": 2, "Digital leverage": 2 },
      reach: "Neighbourhood",
      why: "The baker is the product: each shop needs its own oven, staff and street.",
      wouldScale: ["A second baker trained on your recipes", "Wholesale loaves to cafés nearby", "A central workshop feeding two shops"],
    },
    strengths: [
      { text: "Sourdough is the growing corner of a shrinking market.", finding: "market-2" },
      { text: "Bread spending is still €3.4 billion a year.", finding: "market-1" },
      { text: "Pre-orders let you bake to demand.", finding: "viability-3" },
    ],
    weaknesses: [
      { text: "72% of artisan bakers can't find skilled staff.", finding: "viability-0" },
      { text: "People buy less bread every year.", finding: "market-0" },
      { text: "Supermarket bread is cheaper and open later.", finding: "competition-1" },
    ],
    nextSteps: ["Sell 40 weekend boxes to neighbours by pre-order", "Bake three test batches and log the cost per loaf", "Price two ground-floor units with extraction in Gràcia"],
    pivot: { idea: "Weekend sourdough boxes by pre-order, no shop yet", why: "Proves repeat buyers before rent and staff" },
  },
  steers: [],
};

// ─────────────────────────────────────────────────────────── Ronda · group dog walks in Madrid (city-sized)

const dog: V7Sample = {
  key: "dog",
  id: "ronda",
  idea: "A dog-walking app for busy Madrid professionals, €12 a walk",
  title: "Group dog walks in Madrid",
  match: /\b(dog|dogs|walk|walks|walker|walking|perro|perros|paseo|pet|pets)\b/,
  roster: [
    { role: "demand", mission: "How many dogs, and whose owners lack the time", why: "The buyer is busy, not dog-less" },
    { role: "competition", mission: "Which apps and neighbours already walk Madrid's dogs", why: "Walk platforms already exist" },
    { role: "regulation", mission: "What the animal-welfare law asks of owners and walkers", why: "Animal rules changed in 2023" },
    { role: "viability", mission: "Strengths, weak points and what kills it", why: "Every idea gets a viability check" },
  ],
  work: {
    demand: {
      headline: "A big, growing dog population in one city.",
      findings: [
        { kind: "number", text: "Madrid city had 323,175 registered dogs in 2024.", display: "323,175", value: 323175, unit: "dogs", source: S.madridDogs, impact: 2 },
        { kind: "estimate", text: "Owners away 9–10 hours a workday need a midday walk most.", basis: "Typical office hours plus commute", impact: 1 },
      ],
    },
    competition: {
      headline: "Platforms sell one walker at a time; group routes are open.",
      findings: [
        { kind: "competitor", text: "Rover, Gudog and PaseaPerros list walkers who set their own prices.", source: S.consumerApps, competitor: { name: "Rover, Gudog, PaseaPerros", named: true, note: "Marketplaces, quality varies by walker" }, impact: -1 },
        { kind: "competitor", text: "Préstame Tu Perrito matches volunteer walkers for free; Premium from €4.99 a month.", display: "€0 · €4.99", source: S.consumerApps, competitor: { name: "Préstame Tu Perrito", named: true, price: "Free; Premium €4.99/month", note: "Volunteers, no fixed schedule" }, impact: -1 },
        { kind: "estimate", text: "Few services run fixed group routes by street at a set time.", basis: "Our read of the platforms above; check locally", impact: 1 },
      ],
    },
    regulation: {
      headline: "The law pushes owners to arrange care; some rules still pending.",
      findings: [
        { kind: "fact", text: "Spain's animal-welfare law: a dog can't be left unsupervised over 24 consecutive hours.", display: "24 h", source: S.ministryFaq, impact: 1 },
        { kind: "risk", text: "As of January 2025, the owner course and insurance rules still awaited regulation.", source: S.vozpopuli, impact: -1 },
      ],
    },
    viability: {
      headline: "Good hourly money, capped by walkers and trust.",
      findings: [
        { kind: "strength", text: "Group walks of four dogs earn about €48 an hour per walker.", display: "≈ €48 / h", basis: "4 dogs × €12", impact: 1 },
        { kind: "risk", text: "Walker capacity caps growth: each new walker adds about 20 dogs.", basis: "4 dogs × ~5 walks a day", impact: -1 },
        { kind: "risk", text: "Trust is the sale: one lost dog can end a neighbourhood.", basis: "Word of mouth drives pet services", impact: -1 },
      ],
    },
  },
  judge: {
    verdictLine: "Strong demand, crowded apps: win one neighbourhood with fixed group routes.",
    scalability: {
      parts: { Reach: 5, Repeatable: 6, "Margins at scale": 4, "Founder-free": 4, "Digital leverage": 4 },
      reach: "City",
      why: "Routes repeat street by street, but every walk still needs a person.",
      wouldScale: ["A booking app that fills routes automatically", "Trained walkers paid per route", "The same model in a second city"],
    },
    strengths: [
      { text: "323,175 registered dogs in one city.", finding: "demand-0" },
      { text: "Fixed group routes are a gap the apps leave.", finding: "competition-2" },
      { text: "Four dogs an hour make the hour pay.", finding: "viability-0" },
    ],
    weaknesses: [
      { text: "Rover and Gudog already list walkers.", finding: "competition-0" },
      { text: "Free volunteer matching exists.", finding: "competition-1" },
      { text: "Every walker caps growth at about 20 dogs.", finding: "viability-1" },
    ],
    nextSteps: ["Map 30 dog owners on four streets in one district", "Run a free group walk at 13:00 for a week", "Sign ten owners to a paid weekly route"],
    pivot: { idea: "Fixed midday group routes in one district first", why: "Density makes each walker profitable" },
  },
  steers: [],
};

export const V7_SAMPLES: Record<V7SampleKey, V7Sample> = { coffee, saas, bakery, dog };

/** The v7 sample closest to an idea (demo mode); null when nothing matches (then mocks write labelled estimates). */
export function v7SampleFor(idea: string): V7Sample | null {
  const t = ` ${(idea ?? "").toLowerCase()} `;
  const order: V7SampleKey[] = ["saas", "bakery", "dog", "coffee"];
  for (const k of order) if (V7_SAMPLES[k].match.test(t)) return V7_SAMPLES[k];
  return null;
}

/** Turns raw sample findings into contract findings (ids, analyst, pacing, the source rule). */
export function sampleWork(s: V7Sample, role: AnalystRole): AnalystWork {
  const w = s.work[role];
  const findings = paced((w?.findings ?? []).map((f, i) => enforceSourceRule({ ...f, id: `${role}-${i}`, analyst: role, t: 0 })));
  return finishWork({ analyst: role, status: "done", findings, score: null, headline: w?.headline ?? "" });
}
export const sampleRoster = (s: V7Sample): Analyst[] => weigh(s.roster.map((r) => hire(r.role, r.mission, r.why)));

/** A finished ResultsV7 for a sample (no steers applied). */
export function sampleResults(s: V7Sample): ResultsV7 {
  const roster = sampleRoster(s);
  const work = roster.map((a) => sampleWork(s, a.role));
  return { version: 7, roster, work, report: buildReport(roster, work, s.judge), steers: [], status: "done", researched: 0 };
}

/** Applies a prepared steer to finished results (deterministic: ids continue the analyst's numbering). */
export function samplesSteer(s: V7Sample, prev: ResultsV7, p: PreparedSteer, note: string, at: string): { results: ResultsV7; steer: SteerResult } {
  const fresh: Partial<Record<AnalystRole, { findings: Finding[]; headline?: string }>> = {};
  for (const [role, v] of Object.entries(p.fresh) as Array<[AnalystRole, NonNullable<PreparedSteer["fresh"][AnalystRole]>]>) {
    const n0 = prev.work.find((w) => w.analyst === role)?.findings.length ?? 0;
    const nIds = prev.work.find((w) => w.analyst === role)?.findings.map((f) => f.id) ?? [];
    let n = n0;
    while (nIds.includes(`${role}-${n}`) || prev.steers.some((st) => st.findings.some((f) => f.id === `${role}-${n}`))) n++;
    fresh[role] = {
      headline: v.headline,
      findings: paced(v.findings.map((f, i) => ({ ...f, id: `${role}-${n + i}`, analyst: role, t: 0, ...(v.replaces?.[i] ? { replaces: v.replaces[i] } : {}) }))),
    };
  }
  const id = `steer-${prev.steers.length + 1}`;
  return applySteer(prev, { id, note, plan: p.plan, fresh, judge: p.judge(s.judge), at, why: p.why });
}
