// LaunchDesk v7 — real, sourced sample runs (demo mode and the prototype). Owner: WS-INTEL.
//
// HONESTY: every `source` below is a page WS-INTEL actually opened on 2026-11-15 (url, title as shown on the page or
// in the PDF, domain, access date). A finding quotes only what that page says. Everything else is kind "estimate"
// (or a strength / risk without a source) and carries its basis. No URL, figure, name or quote is written from memory.
// The analysis (impacts, scalability parts, strengths, next steps) is our judgement, not a claim of fact.
// Scores are never typed here: server/v7.ts buildReport() computes them from these findings.
import { applySteer, buildReport, enforceSourceRule, finishWork, hire, paced, weigh, type Analyst, type AnalystRole, type AnalystWork, type Finding, type JudgeDraft, type ResultsV7, type SourceRef, type SteerPlan, type SteerResult } from "./v7.js";

export const ACCESSED = "2026-11-15";
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

// ───────────────────────────────────────────────────────────── founder-report samples (demo mode, block contract)
// Generated from the measured opt runs (.notes/quality/opt: V1-a for the bakery, V4-b for the dog walkers): the real
// research notes with their [S#] labels, the real source pages the tools returned, and the writer's real Markdown
// with its econ inputs. MOCK_AI replays them through the same finalize + parse path as a live run.
// The `scores` / `scalability` judgement fields are our reading of each report, not claims of fact.
export interface ReportSample { idea: string; /** Date the run read its pages (the opt runs, 2026-11-16). */ accessed: string; research: Record<"customers" | "competition" | "money" | "risks", string>; sources: Array<{ id: string; url: string; title: string }>; writer: string }
export const REPORT_SAMPLES: Partial<Record<V7SampleKey, ReportSample>> = {
 "bakery": {
  "idea": "A sourdough bakery in Valencia's Ruzafa neighbourhood with weekly bread subscriptions at €25 a month",
  "accessed": "2026-11-16",
  "research": {
   "customers": "- The municipal register put Ruzafa at 25,514 residents across 87.8 hectares as of 1 January 2025, according to a 2026 expat guide to the neighbourhood. 25.514 habitantes en 87,8 hectáreas (padrón, 1 de enero de 2025) [S1]\n- Other sources give lower figures for earlier dates, which likely reflects different boundaries or sources. One report puts the 1 January 2023 register at 24,432 residents. La población actual del barrio de Ruzafa, según el Padrón Municipal de Habitantes del 1 de enero de 2023, es de 24 432 personas. [S2]\n- A participation-platform profile gives 23,735 residents in 2022, with 15.2% holding foreign nationality, close to the city average. En 2022, el vecindario de Russafa ascendía a 23.735 personas, el 15,2% del cual tiene nacionalidad extranjera, un porcentaje similar a la media de la ciudad [S3]\n- In 2006 the foreign share was higher, at 17.5% of 25,599 residents, well above the city average. En 2006, con un vecindario de 25.599 personas, el 17,5% era extranjero, una proporción muy superior a la media de la ciudad. [S3]\n- The same profile says gentrification is weakening the neighbourhood's historically mixed social profile. Desde primeros del siglo XX, se conformó como un barrio heterogéneo socialmente, aunque ahora este rasgo se debilita por el proceso de gentrificación. [S3]\n- The 2015 city-council neighbourhood study counted 23,855 residents that year. El año 2015 el barrio de Russafa cuenta con 23.855 habitantes [S4]\n- A 2026 expat guide describes the area as a hub of independent cafés, galleries, vintage shops and coworking spaces. se ha transformado en un núcleo vibrante de cafés independientes, galerías de arte, tiendas vintage y espacios de coworking. [S1] This is qualitative and gives no demand data.\n- Young-professional share, age structure for 2024–2026: not found in the search results.\n- Spanish or Valencian household bread spending per year (INE Encuesta de Presupuestos Familiares or similar): not found.\n- Demand for artisan or sourdough bread in Valencia, including market size or growth: not found.\n- Competing sourdough bakeries and their subscription or weekly bread plans in Ruzafa, with current prices: not found.\n- Willingness of Ruzafa households to pay €25 a month for a bread subscription, or any local survey on subscription uptake: not found.\n- Caveat: I was limited to one search and no page fetches for this note, so the bread, subscription and competitor lines above are gaps that need primary checks (INE household budget survey, price lists of local bakeries, and a small customer survey) before committing savings.",
   "competition": "- The Baker in Russafa (Calle del Maestro Jose Serrano 7) describes its core product as sourdough-based natural bread, but its Tripadvisor page has only two reviews and no date. We specialize in backing natural bread based on sourdough; the listing gives its address as Calle del Maestro Jose Serrano 7 in Russafa. [S5]\n- Horno San Bartolomé has a Russafa branch, while its main shop is in El Carme at Plaça del Tossal 6. Its price band is €–€€ in the 2026 guide. Horno San Bartolomé's listing gives its neighbourhood as El Carme, notes a Russafa branch, and lists the price as €–€€. [S6]\n- Fornelino, at Av. de Peris i Valero 157 on the Russafa/Eixample border, is rated at the cheapest price band (€) in the 2026 guide, but the guide focuses on pastries rather than bread. Fornelino sits on the Russafa/Eixample border at Av. de Peris i Valero 157, with a € price band. [S6]\n- Passage à Paris, at C/ del Dr. Sumsi 29 in Russafa, is a €€ French-pastry bakery, so it competes more on pastry than on sourdough. Passage à Paris is in Russafa at C/ del Dr. Sumsi 29, price €€, with its almond croissant recommended. [S6]\n- Pepina Pastel Ruzafa is listed at the top price tier ($$$$) on Tripadvisor, though that listing is undated and the tier is not a per-loaf price. Pepina Pastel Ruzafa Valencia is listed on Tripadvisor with a $$$$ price range. [S7]\n- Too Good To Go is active in Ruzafa: Pans Ruzafa sells a surplus pack for €2.99 against a €9.00 value (undated). Pans Ruzafa's listing shows a €9.00 value with a €2.99 pack price. [S8]\n- Panaria Ruzafa 15 offers a surprise bakery pack for €3.99 against a €12.00 value (undated), which signals a discounted surplus-bread channel near the target area. Panaria's Ruzafa 15 listing shows €12.00 value and a €3.99 surprise bakery pack. [S9]\n- Dulce de Leche Boutique in Ruzafa offers a bread-containing rescue pack at €2.99 (undated), again a one-off surplus product, not a subscription. Dulce de Leche Boutique's Ruzafa listing includes a bread pack at €2.99 against a €9.00 value. [S10]\n- Mercado de Ruzafa has a bread kiosk, and one reviewer describes its prices as local-oriented (undated review). Mercado de Ruzafa has a smaller bread kiosk, and a reviewer described its prices as local-oriented. [S11]\n- Panadería Baking Free, listed in the Wanderlog guide, uses sourdough flour and is entirely gluten-free, a niche rather than a direct competitor. Baking Free uses sourdough flour, and everything it sells is gluten-free, according to one reviewer. [S11]\n- Loaf prices for named Valencia sourdough bakeries: not found. The only prices I found are price bands or pack prices.\n- Existing bread subscriptions or bread delivery in Valencia: not found in this search.\n- Supermarket and panadería bread prices in Valencia, 2026: not found. Official statistics on bread prices were not searched in this single query.\n\nCoverage caveat: this rests on one search, and most sources are undated review or listing sites. Loaf prices, subscriptions and supermarket benchmarks need a second round of checks before the €25/month figure can be benchmarked.",
   "money": "- A 160 m² corner unit on Literato Azorín, with a listed rent of 2,350 €/month (about 14.69 €/m²), was on offer in the search results. The listing carries no year. Metropolitan Real Estate, Ibercasa and others listed 160 m² and 176 m² units on Calle del Literat Azorín and Calle de Cuba. [S12]\n- Ruzafa rents vary a lot. A 300 m² unit on Carrer de Cadis was listed at 1,750 €/month (5.83 €/m²), and the same source shows a 70 m² unit at 300 €/month (4.29 €/m²). Milanuncios shows the listing without a year. The Milanuncios page lists units from 300 € to 1,750 € per month, with prices per m² shown. [S13]\n- Idealista's cheapest Russafa listings include a 160 m² unit at 1,200 €/month (7.50 €/m²) and a 100 m² unit on Avenida de Peris i Valero at 1,200 €/month (12.00 €/m²). These are asking prices, not transactions. Idealista's sorted-by-price page shows 160 m² at 7.50 €/m² and 100 m² at 12.00 €/m² [S14].\n- Asking rents for a 160 m² unit at 2,350 €/month come to about 28,200 € a year (my own calculation from the listing). Rents for units about 65 m² on Passatge Doctor Serra run near 20.77 €/m² at 1,350 €/month. A 65 m² upper-floor unit on Passatge Doctor Serra is listed at 1,350 €/month with a 12,000 € key-money (traspaso) asking price. [S15]\n- Key-money (traspaso) asking prices in Russafa range widely. Listings run from 10,000 € on a small unit to 260,000 € for a 150 m² space at 3,000 €/month. The Idealista list includes a 150 m² unit at 3,000 €/month with a 260,000 € traspaso price. [S16]\n- Idealista's average asking price on its corner-filtered Russafa page was 22.21 €/m². That average covers only six listings, so it is a weak benchmark. The page reports an average asking price of 22.21 €/m² across its six listings. [S16]\n- A 160 m² former hospitality unit in Russafa is listed with air conditioning, a kitchen, two bathrooms and two shopfronts, but with no licence noted. The Yaencontre listing describes a 160 m² unit with two shopfronts, air conditioning, a kitchen and two bathrooms, previously used for hospitality without a licence. [S17] This matters for whether a bakery can open there without a new licence (not verified).\n- The listing dates on several Idealista commercial pages are unclear. Some show only day and month (for example \"09 sep\" and \"30 dic\") with no year, so these prices may be stale.\n- Flour and ingredient costs in Spain or Valencia: not found in this search.\n- Baker wages in Spain or Valencia (2026): not found in this search.\n- Oven and bakery equipment prices: not found in this search.\n- Bakery margins in Spain: not found in this search.\n- VAT rate on bread in Spain (2026): not found in this search.\n- Local bread-subscription prices or demand in Valencia, including whether €25/month is in line with the market: not found in this search.\n- Total start-up capital for a Valencia bakery, including fit-out and deposits: not found in this search. The one search I ran returned only rental listings, so the remaining topics need separate research before you commit savings.",
   "risks": "- A Valencia bakery needs a municipal activity licence, which requires a technical project signed by an engineer or architect, plus RGSEAA registration under Real Decreto 191/2011, according to a 2026 franchise guide (Después, el local necesita la licencia de actividad municipal (con proyecto técnico firmado por ingeniero o arquitecto) y la inscripción en el Registro General Sanitario de Empresas Alimentarias y Alimentos (RGSEAA), regulado por el Real Decreto 191/2011 [S18]).\n- Without both approvals, the premises cannot open to the public (2026 franchise guide, same source as above, Sin la licencia municipal y el RGSEAA, el establecimiento no puede abrir al público. [S18]).\n- A bakery with its own production workshop (obrador) faces stricter licence requirements than a bread counter with no production, per a Spanish setup guide, undated in the results (los requisitos en este caso son más estrictos para un obrador que para un simple despacho de pan. [S19]).\n- The AESAN RGSEAA guide (revision 15, approved June 2024) says regional registers cover establishments that mainly sell to final consumers, while the national register covers other food-chain operators, so confirm which register applies to a shop with a workshop (Aquellos establecimientos en donde mayoritariamente se venden o sirven productos alimenticios al consumidor final. [S20]).\n- Typical 2026 cost for licences and technical project, per the franchise guide: €3,000–8,000 (Licencias y proyecto técnico | Licencia de actividad, RGSEAA, proyecto de ingeniería, tasas municipales | 3.000 a 8.000 € [S18]).\n- Ruzafa-specific licence timelines, fees, or Ayuntamiento processing times: not found.\n- Valencia applies the common AEAT tax regime for autónomos, with the same 15% or 7% IRPF withholding rules as the rest of Spain (2026 guide, Valencia aplica el régimen común de la AEAT [S21]).\n- The 2026 minimum social security contribution for the first bracket (net earnings up to €670/month) is about €206/month (2026 guide, En 2026 la cuota mínima del primer tramo (rendimientos de hasta 670 € al mes) es de unos 206 €. [S21]).\n- For an autónomo with €1,500/month net, the same 2026 guide gives a minimum of €302.65/month in social security, but the article later uses about €381/month, so check the current contribution table before budgeting.\n- Valencia's bakery collective agreement runs 2025–2028, with a 2% increase for 2026 on top of the 2025 adjustment, and a possible extra 1% from 2027 if December 2026 CPI exceeds 2% (Vigencia: 2025/01/01 - 2028/12/31. Retribuciones para 2026: al resultado del incremento del apartado anterior se aplicará un 2 %. [S22]; the 2027 clause is in Finalizado 2026, si el IPC interanual de diciembre de 2026 fuera superior a 2 %, se aplicará un incremento adicional máximo del 1 % [S22]).\n- The 2026 salary tables for the Valencian bakery sector were published in the DOGV on 26 January 2026, but the individual wage amounts were not in the snippet (Las retribuciones de aplicación con efectos desde 1 de enero de 2026 son las [S23]).\n- To reduce input-cost risk, a Spanish setup guide recommends annual supplier contracts indexed to cereal prices (Es recomendable firmar contratos anuales con clausulado de indexación al precio del cereal [S18]).\n- A commercial guide proposes a start-up budget split of roughly 40% equipment, 20% works and flue, 15% shop and branding, and 25% working capital and licences; it is not independently sourced, so treat it as a rough check only (40% equipamiento obrador, 20% obra + salida humos, 15% tienda + branding, 25% fondo maniobra + licencias. [S24]).\n- Bakery failure or closure rates in Spain or Valencia: not found.\n- Valencia energy prices for commercial bakeries (electricity and gas) in 2026: not found.\n- Subscription churn benchmarks for weekly bread or food subscriptions: not found.\n- Shared kitchen (cocina compartida) and market stall (mercado) options and prices in Valencia: not found.\n- Ruzafa commercial rents and local availability: not found."
  },
  "sources": [
   {
    "id": "S1",
    "url": "https://valenciamove.com/es/barrios-valencia/ruzafa/",
    "title": "Russafa, Valencia - Guía de barrio para expatriados 2026"
   },
   {
    "id": "S2",
    "url": "https://es.wikipedia.org/wiki/Ruzafa_(Valencia)",
    "title": "Ruzafa"
   },
   {
    "id": "S3",
    "url": "https://participabarrios.es/project/russafa-valencia/",
    "title": "Russafa (Valencia) - participabarrio"
   },
   {
    "id": "S4",
    "url": "https://www.valencia.es/documents/20142/618951/Estudio%20Barrio%20Russafa%202016.pdf/f90daa26-61fd-432e-b6bb-37243786779c",
    "title": "Estudio del barrio de Russafa NOVIEMBRE 2016"
   },
   {
    "id": "S5",
    "url": "https://www.tripadvisor.com/Restaurant_Review-g187529-d23423892-Reviews-The_Baker-Valencia_Province_of_Valencia_Valencian_Community.html",
    "title": "THE BAKER, Valencia - Russafa - Restaurant Reviews, Photos & Phone ..."
   },
   {
    "id": "S6",
    "url": "https://abroadinvalencia.com/bakeries-in-valencia/",
    "title": "The 15 Best Bakeries in Valencia (Spain, 2026) - Abroad in Valencia"
   },
   {
    "id": "S7",
    "url": "https://www.tripadvisor.com/Restaurants-g187529-zfg9901-Valencia_Province_of_Valencia_Valencian_Community.html",
    "title": "THE 10 BEST Bakeries in Valencia - Tripadvisor"
   },
   {
    "id": "S8",
    "url": "https://www.toogoodtogo.com/es/find/valencia/panscompany/bakedgoods/dulce-31827088483663680",
    "title": "Pans Ruzafa"
   },
   {
    "id": "S9",
    "url": "https://www.toogoodtogo.com/es/find/valencia/panaria/meal/packvariado-141939709964780672",
    "title": "Panaria Ruzafa 15 Valencia"
   },
   {
    "id": "S10",
    "url": "https://www.toogoodtogo.com/es/find/valencia/dulcedelecheboutique-ruzafa/bakedgoods/packpan-770292",
    "title": "Dulce de Leche Boutique - Ruzafa"
   },
   {
    "id": "S11",
    "url": "https://wanderlog.com/list/geoCategory/8208/best-bread-shops-in-valencia",
    "title": "The 32 best bread shops in Valencia"
   },
   {
    "id": "S12",
    "url": "https://www.idealista.com/alquiler-locales/valencia/l-eixample/russafa/con-locales/",
    "title": "Alquiler locales en Russafa, València — idealista"
   },
   {
    "id": "S13",
    "url": "https://www.milanuncios.com/alquiler-de-locales-comerciales-en-valencia/ruzafa.htm",
    "title": "Ruzafa Locales comerciales en alquiler en Valencia. Alquiler de ..."
   },
   {
    "id": "S14",
    "url": "https://www.idealista.com/alquiler-locales/valencia/l-eixample/russafa/?ordenado-por=precios-asc",
    "title": "Alquiler locales o naves baratos en Russafa, València — idealista"
   },
   {
    "id": "S15",
    "url": "https://www.idealista.com/geo/alquiler-locales/calle-ruzafa-valencia-valencia-valencia/",
    "title": "Locales o naves en alquiler, Calle Ruzafa, València — idealista"
   },
   {
    "id": "S16",
    "url": "https://www.idealista.com/alquiler-locales/valencia/l-eixample/russafa/con-locales,esquina/",
    "title": "Alquiler locales en Russafa, València — idealista"
   },
   {
    "id": "S17",
    "url": "https://www.yaencontre.com/alquiler/locales/valencia/barrio-russafa",
    "title": "Locales en alquiler en Russafa, Valencia · 34 locales disponibles ..."
   },
   {
    "id": "S18",
    "url": "https://lexpress-franchise.com/es/articulos/abrir-una-panaderia/",
    "title": "Cómo abrir una panadería en España 2026: pasos clave"
   },
   {
    "id": "S19",
    "url": "https://ayudatpymes.com/gestron/montar-panaderia/",
    "title": "Cómo montar una panadería paso a paso + Costes"
   },
   {
    "id": "S20",
    "url": "https://www.aesan.gob.es/AECOSAN/docs/documentos/seguridad_alimentaria/registro/Guia_RGSEAA.pdf",
    "title": "REVISIÓN 15 Aprobada en Comisión Institucional 12-06-2024"
   },
   {
    "id": "S21",
    "url": "https://autonomiapro.com/blog/autonomo-valencia-cuota",
    "title": "Autónomo en Valencia 2026: cuota SS, IRPF e IVA"
   },
   {
    "id": "S22",
    "url": "https://ccoo.app/convenio/convenio-colectivo-panaderia-y-pasteleria-de-c-autonoma-de-valencia/",
    "title": "Convenio Colectivo Panadería y Pastelería de Valencia"
   },
   {
    "id": "S23",
    "url": "https://dogv.gva.es/datos/2026/01/26/pdf/2026_2242_es.pdf",
    "title": "Núm. 10288 / 26.01.2026 1 / 3 CVE: DOGV-C-2026-2242 https://d..."
   },
   {
    "id": "S24",
    "url": "https://aichef.pro/guia-panaderia-obrador",
    "title": "Cómo Montar una Panadería con Obrador — Guía Completa España ..."
   }
  ],
  "writer": "# Founder report: Sourdough bread subscriptions in Ruzafa, Valencia\n\n## Executive summary\n\nThe idea is a sourdough bakery in Ruzafa selling weekly bread subscriptions at €25 a month. Ruzafa is a dense, central neighbourhood of about 25,500 registered residents [S1], with a strong base of independent cafés and food shops [S1]. The evidence against the idea is more concrete. Several bakeries already sell natural sourdough in the area [S5][S6]. Discounted surplus bread is sold for under €4 a pack [S8][S9]. I found no data on bread spending, no local subscription prices and no evidence that households would pay €25 a month. Rents are high and vary widely [S14][S16]. Start-up costs are unknown: licences alone are estimated at €3,000–8,000 [S18]. Unit economics are computed in the Money section: contribution per subscriber-month is €17.54 at a margin of 73%, and break-even is 195 subscribers against fixed costs of €3,406 a month. Start-up capital is estimated at €66,600, and most of those inputs are estimates. Verdict: do not commit savings yet.\n\n## Verdict\n\n**NO-GO on committing savings now.** Reopen the decision only if the three checks below pass.\n\n- Demand for a €25 subscription is unproven. No local survey, price list or subscription benchmark was found.\n- Competition is real. The Baker in Russafa already sells natural sourdough [S5], and Horno San Bartolomé has a Russafa branch [S6].\n- Break-even depends on 195 subscribers. That is a large base for a new bakery with no audience yet.\n- The premises and licence path is uncertain. Some Ruzafa units were previously hospitality without a licence [S17], and a bakery with its own workshop faces stricter rules [S19].\n\n## 3 things to validate first\n\n1. **Households will pay €25 a month for weekly bread.**\n   - *Why it matters:* Revenue is entirely subscription-based. If uptake is low, the break-even of 195 subscribers is never reached and the lease and licence costs are sunk.\n   - *Test this month:* Contact 100 households through local WhatsApp groups, building-community lists and the two or three nearby cafés. Offer a 4-loaf-a-month pre-subscription at €25, refundable. Run it for 30 days.\n   - *Pass:* at least 15 paid pre-subscriptions. *Fail:* fewer than 15, or fewer than 30 replies of interest.\n\n2. **Ingredient and packaging costs fit the unit economics.**\n   - *Why it matters:* Variable costs are the second lever. Flour and ingredient prices were not found [S18 covers only the advice to index supplier contracts to cereal prices]. If real costs are higher than the figure in the model, contribution per subscriber-month falls below the break-even level.\n   - *Test this month:* Get written quotes from at least two Valencian flour mills or wholesalers for the flour, salt, and packaging needed for 4 loaves a week per subscriber. Price two current local loaves and check the price against €25 for four loaves.\n   - *Pass:* quoted variable cost per subscriber-month is at or below the variable cost in the unit economics model, with a margin you can accept. *Fail:* quotes above that figure.\n\n3. **The premises can legally host a bakery with a workshop, and the licence costs are within range.**\n   - *Why it matters:* Without the municipal activity licence and RGSEAA registration the shop cannot open [S18]. A workshop triggers stricter requirements [S19]. Fit-out and licence costs drive €66,600.\n   - *Test this month:* Ask a technical engineer or architect for a written view on a specific unit, and send a written enquiry to the Ayuntamiento de València about the activity licence for a bakery with production. Get one fit-out quote.\n   - *Pass:* written confirmation that the unit can be licensed for a bakery with workshop, and total licence and project costs within €3,000–8,000 [S18]. *Fail:* the unit needs a new licence process that you cannot fund, or the costs exceed the range.\n\n## Customers & demand\n\n**Takeaway:** Ruzafa has enough residents to support a niche subscription, but no source measures bread demand or subscription uptake. Demand is the largest unknown.\n\n**Evidence:**\n- The municipal register counted 25,514 residents across 87.8 hectares on 1 January 2025 [S1].\n- Other figures for earlier years are lower: 24,432 on 1 January 2023 [S2], and 23,735 in 2022 [S3]. Boundaries or sources probably explain the gap [S1][S2][S3].\n- 15.2% of residents in 2022 held foreign nationality, close to the city average [S3]. In 2006 the share was 17.5% [S3].\n- The neighbourhood's mixed social profile is weakening under gentrification [S3]. This could help a premium product, or push the target group out.\n- The area is described as a hub of independent cafés, galleries, vintage shops and coworking spaces [S1]. This is qualitative and gives no demand data.\n- No age structure, young-professional share or household bread spending figure was found for Ruzafa or Valencia.\n\n**Key numbers:**\n\n| Figure | Value | Source |\n|---|---|---|\n| Residents, 1 Jan 2025 | 25,514 | S1 |\n| Residents, 2022 | 23,735 | S3 |\n| Foreign nationality share, 2022 | 15.2% | S3 |\n| Subscription price tested | €25 per month (4 loaves) | Given idea |\n| Households needed for break-even | 195 subscribers | Model (see Money) |\n| Household bread spend, Valencia | Not found | — |\n| Subscription uptake in Ruzafa | Not found | — |\n\n**What it means for you:** The population is large enough to test a niche. The break-even figure is a large share of a neighbourhood's households once you account for the share who would ever buy a subscription, so you must establish demand before you sign a lease. The first test is a 30-day pre-subscription offer, not a survey.\n\n**Next actions:**\n1. Find the household bread spending figure in the INE Encuesta de Presupuestos Familiares for the Comunitat Valenciana and record it.\n2. Send the 100-household pre-subscription offer described in validation item 1 and log responses daily.\n3. Walk the Ruzafa cafés and two competitor bakeries on a Saturday morning and count queues and sold-out times.\n\n## Competition & alternatives\n\n**Takeaway:** Ruzafa already has bakeries selling sourdough and a set of cheap surplus-bread packs. None of these is a weekly subscription, so the subscription format is the gap. But the sourdough product itself is not unique, and the price of a loaf is not known.\n\n**Evidence:**\n- The Baker in Russafa, Calle del Maestro Jose Serrano 7, describes its core product as sourdough natural bread [S5]. Its listing is thin, with two undated reviews [S5].\n- Horno San Bartolomé's main shop is in El Carme, with a Russafa branch. Its price band is €–€€ [S6].\n- Fornelino, at Av. de Peris i Valero 157, is in the cheapest band (€), but the guide covers pastries, not bread [S6].\n- Passage à Paris, at C/ del Dr. Sumsi 29, is a €€ French-pastry bakery and competes more on pastry than on sourdough [S6].\n- Surplus-bread packs: Pans Ruzafa sells a pack for €2.99 against a €9.00 value [S8]. Panaria Ruzafa 15 sells a surprise pack for €3.99 against €12.00 [S9]. Dulce de Leche Boutique sells a bread pack for €2.99 [S10]. These are one-off, not subscriptions.\n- Mercado de Ruzafa has a smaller bread kiosk with local-oriented prices, according to one undated review [S11].\n- Baking Free uses sourdough flour but sells only gluten-free products [S11]. It is a niche competitor.\n- No named Valencia sourdough loaf prices, existing bread subscriptions or delivery services were found.\n\n**Key numbers:**\n\n| Figure | Value | Source |\n|---|---|---|\n| Surplus bread pack price (Pans Ruzafa) | €2.99 vs €9.00 value | S8 |\n| Surplus bread pack price (Panaria) | €3.99 vs €12.00 value | S9 |\n| Horno San Bartolomé price band | €–€€ | S6 |\n| Loaf price, named sourdough bakeries | Not found | — |\n| Existing subscriptions in Valencia | Not found | — |\n\n**What it means for you:** Your advantage would be the subscription format and a clear weekly routine, not the sourdough itself. Your customers will compare you with a €3–4 surplus pack and a local bakery loaf. Until you know the loaf price, you cannot judge whether €25 for four loaves looks cheap or expensive. Check the loaf price before setting the subscription price.\n\n**Next actions:**\n1. Visit The Baker in Russafa, Horno San Bartolomé and the Mercado kiosk. Record the price of one standard sourdough loaf at each and note the weight.\n2. Check whether any of these bakeries offers a subscription or standing order, and record the terms.\n3. Write a one-page comparison of your offer against the surplus packs and the nearest bakery loaves, using the prices you collected.\n\n## Money\n\n**Takeaway:** Rents are the largest fixed cost and vary widely in Ruzafa. Start-up capital and most variable costs are estimates. The unit economics model shows that break-even depends on a large subscriber base, so the rent and licence costs matter as much as the price.\n\n**Evidence:**\n- A 160 m² corner unit on Literato Azorín was listed at €2,350 a month, about €14.69/m² [S12]. The listing has no year.\n- A 300 m² unit on Carrer de Cadis was listed at €1,750 a month [S13]. A 70 m² unit was listed at €300 a month [S13].\n- Idealista's cheapest Russafa listings include a 160 m² unit at €1,200 a month (€7.50/m²) and a 100 m² unit on Avenida de Peris i Valero at €1,200 a month (€12.00/m²) [S14]. These are asking prices.\n- A 65 m² upper-floor unit on Passatge Doctor Serra was listed at €1,350 a month with a €12,000 key-money asking price [S15].\n- Key-money (traspaso) asking prices run from €10,000 to €260,000 [S16].\n- Idealista's average asking price was €22.21/m², but it covers only six listings [S16]. Treat it as weak.\n- A 160 m² former hospitality unit has two shopfronts and a kitchen, with no licence noted [S17].\n- Some Idealista commercial listings show only day and month, so the prices may be stale [S14][S16].\n- Ingredient costs, baker wages, oven prices, bakery margins and VAT on bread were not found in the research.\n\n**Key numbers:**\n\n| Figure | Value | Source |\n|---|---|---|\n| Cheapest 160 m² Russafa rent (asking) | €1,200/month | S14 |\n| Largest corner-unit asking rent (160 m²) | €2,350/month | S12 |\n| Average asking price, Russafa (6 listings) | €22.21/m² | S16 |\n| Licence and technical project cost | €3,000–8,000 | S18 |\n| Minimum autónomo social security, first bracket (2026) | About €206/month | S21 |\n| Bakery collective agreement, 2026 increase | 2% | S22 |\n| Subscription price | €25/month | Given idea |\n| Contribution margin | 73% | Model |\n| Break-even | 195 subscribers | Model |\n| Start-up capital | €66,600 | Model |\n| VAT rate on bread | Estimate, not verified (see below) | Estimate |\n| Flour, ingredient and wage costs | Estimate, not verified | Estimate |\n\n**Unit economics**\n\nThe unit is one subscriber-month: four weekly loaves at €25.\n\n- **Price and VAT:** The customer pays €25 including VAT. The VAT rate used is an estimate, not a sourced figure. The VAT rate on bread was not found in the research, so confirm it with a tax adviser before using the model. Net revenue per unit is €24.04.\n- **Share kept:** The model assumes you sell directly, so you keep 100% of net revenue. No marketplace commission applies.\n- **Variable costs:** Flour and ingredients, and packaging and delivery, are estimates. No Spanish flour or packaging price was found. Total variable cost per unit is €6.50. Contribution per unit, after variable costs, is €17.54, at a margin of 73%.\n- **Fixed monthly costs:** Rent uses the cheapest 160 m² asking rent found [S14]. Utilities, insurance, accounting and software are estimates. Owner social security uses the 2026 minimum [S21], which conflicts with a second figure in the same source [S21]. Baker wages are an estimate because no wage tables were retrieved [S23]. Total fixed monthly costs are €3,406.\n- **Break-even:** 195 subscribers is the number at which contribution covers fixed monthly costs.\n- **Start-up capital:** The licence and technical project use the upper bound from the franchise guide [S18]. Oven and equipment, fit-out, deposit and working capital are estimates with no sourced prices. The total is €66,600. A commercial guide suggests equipment is about 40% of start-up budget and working capital and licences about 25% [S24], but it is not independently sourced, so use it only as a rough check.\n- **Sensitivity:** Every estimated input moves break-even. Replace each estimate with a quote before deciding.\n\n**What it means for you:** Your savings are exposed to rent, licence and equipment costs before you know whether households will subscribe. The break-even figure is high for a single-counter shop. If the tests show strong demand, a smaller commitment (for example, a shared kitchen or market stall) could be a lower-risk start. Shared kitchen and market-stall prices were not found, so this is untested.\n\n**Next actions:**\n1. Get written asking rents for two units you could use, and check the listing dates. Include the key-money price for each.\n2. Replace the estimated variable costs and oven price with supplier quotes. Re-run the model with the quoted figures.\n3. Ask a gestor (tax adviser) to confirm the VAT rate on bread, the autónomo contribution for your expected income, and the 2026 baker wage table under the Valencian agreement [S22][S23].\n\n\n## Risks & how to start\n\n**Takeaway:** The main legal risk is the licence and registration path for a bakery with its own workshop. The main commercial risk is that no one has shown they will pay €25 a month. Both are checkable before you sign a lease.\n\n**Evidence:**\n- A Valencia bakery needs a municipal activity licence, with a technical project signed by an engineer or architect, and RGSEAA registration under Real Decreto 191/2011 [S18].\n- Without both approvals the premises cannot open to the public [S18].\n- A bakery with its own workshop has stricter licence requirements than a simple bread counter [S19].\n- The national and regional RGSEAA registers apply differently, so confirm which one covers a shop with a workshop [S20].\n- Typical licence and technical project costs are €3,000–8,000 [S18].\n- Ruzafa-specific licence timelines and fees were not found.\n- Valencia applies the common AEAT tax regime to autónomos [S21].\n- The 2026 minimum social security for the first bracket is about €206 a month [S21]. The same source gives €302.65 for €1,500 net earnings and later uses about €381, so check the current contribution table [S21].\n- The Valencian bakery collective agreement runs 2025–2028, with a 2% increase for 2026 and a possible extra 1% from 2027 if December 2026 CPI exceeds 2% [S22].\n- The 2026 wage tables were published in the DOGV on 26 January 2026, but the amounts were not in the snippet retrieved [S23].\n- A Spanish setup guide recommends annual supplier contracts indexed to cereal prices [S18].\n- Not found: bakery failure rates, Valencia energy prices for commercial bakeries, subscription churn benchmarks for food, and shared kitchen or market-stall prices.\n\n**Key numbers:**\n\n| Figure | Value | Source |\n|---|---|---|\n| Licence and technical project | €3,000–8,000 | S18 |\n| Minimum autónomo social security (2026) | About €206/month | S21 |\n| Collective agreement increase, 2026 | 2% | S22 |\n| Suggested equipment share of start-up budget | About 40% (not independently sourced) | S24 |\n| Bakery failure rate | Not found | — |\n| Energy costs, commercial bakery | Not found | — |\n\n**What it means for you:** Do not sign a lease until a licence adviser has confirmed the route for your specific unit and the workshop. Do not buy equipment until the subscription test passes. If the tests fail, the cost is a few hundred euros of outreach and quotes, not your savings in a lease.\n\n**Next actions:**\n1. Contact an engineer or architect for a written view on the licence route for one specific unit, including whether the workshop triggers the stricter rules [S19].\n2. Email the Ayuntamiento de València for its written process for a bakery with production, and ask which RGSEAA register applies [S20].\n3. Set up the 30-day pre-subscription test and a tracking sheet. Review the three validation results with a gestor before deciding.\n\n```econ\n{\"unit\":\"one subscriber-month (4 weekly loaves at €25/month)\",\"price_per_unit_gross_eur\":25,\"vat_rate\":0.04,\"share_kept\":1,\"variable_costs_per_unit\":[{\"item\":\"flour, salt and ingredients for 4 loaves\",\"eur\":4,\"source\":\"estimate\"},{\"item\":\"packaging and delivery\",\"eur\":2.5,\"source\":\"estimate\"}],\"fixed_monthly_costs\":[{\"item\":\"rent, 160 m² unit\",\"eur\":1200,\"source\":\"S14\"},{\"item\":\"utilities\",\"eur\":300,\"source\":\"estimate\"},{\"item\":\"insurance, accounting and software\",\"eur\":200,\"source\":\"estimate\"},{\"item\":\"owner social security, first bracket\",\"eur\":206,\"source\":\"S21\"},{\"item\":\"baker wages (part-time)\",\"eur\":1500,\"source\":\"estimate\"}],\"startup_costs\":[{\"item\":\"licence and technical project\",\"eur\":8000,\"source\":\"S18\"},{\"item\":\"oven and bakery equipment\",\"eur\":35000,\"source\":\"estimate\"},{\"item\":\"fit-out works\",\"eur\":15000,\"source\":\"estimate\"},{\"item\":\"deposit and first-month rent (3 months at 1,200)\",\"eur\":3600,\"source\":\"S14\"},{\"item\":\"working capital\",\"eur\":5000,\"source\":\"estimate\"}],\"scores\":{\"customers\":4,\"competition\":4,\"money\":3,\"risks\":4},\"scalability\":{\"reach\":2,\"repeatable\":4,\"margins\":4,\"founder_free\":3,\"digital\":2,\"reach_label\":\"Neighbourhood\",\"why\":\"Each new area needs its own oven, premises and baker.\",\"would_scale\":[\"A second pickup point in a nearby barrio\",\"Wholesale loaves for cafés\"]}}\n```\n"
 },
 "dog": {
  "idea": "A mobile app that lets dog owners in Madrid book vetted dog walkers by the hour",
  "accessed": "2026-11-16",
  "research": {
   "customers": "- Madrid city had 323,175 registered dogs in the 2024 census, roughly one dog for every 11 residents. Madrid cuenta con 323.175 y 174.251 perros y gatos registrados respectivamente, una proporción de un perro por cada 11 personas [S12]\n- Madrid households with dogs: not found. No official count of Madrid dog-owning households appeared in the results.\n- Nationally, Spain had about 7.56 million dogs in 2025, according to the Ministry of Social Rights statistics. La estadística nacional de protección animal publicada en 2026 por el Ministerio de Derechos Sociales contabiliza 15,17 millones de animales de compañía registrados en España en 2025 [S13], and 7,56 millones son perros [S13].\n- Average annual pet spending per Spanish household was 315.35 € in 2025, per INE data cited by a third-party site. El gasto medio fue de 315,35 € por hogar en 2025, según el INE. [S14]\n- Madrid's regional pet spending per household conflicts across sources: 381.38 € in one article (based on the INE's 2024 household budget survey), and 323.03 € for 2025 in another. Comunidad de Madrid (381,38 €) [S15]; Madrid | 323,03 € [S14].\n- Average spending per dog in Spain was 1,908 € a year (about 159 € a month) in the IPMARK 2025 report. El gasto total en animales de compañía asciende a 159 euros mensuales por perro (1.908 euros al año) [S16]\n- Share of Spanish households with a pet is disputed: an IFEMA-cited study puts it at 54%, while AMVAC data cited elsewhere says more than 40%. El estudio, basado en una encuesta a 713 propietarios responsables de 879 animales [S17] covers the 54% figure; más de un 40% de los hogares tiene mascota [S15] covers the AMVAC figure. Neither is Madrid-specific or dated to the same year.\n- Madrid-specific share of dog-owning households: not found. A blog estimate of Madrid dog-household counts assumes 1.3 dogs per household, but that figure comes from a 2014 study and is not updated, so I would not rely on it. suponiendo que tenemos una media de 1,3 perros por hogar (dato medio random, porque es de un estudio de 2014 y no ha sido actualizado) [S18]",
   "competition": "- Rover's average Madrid dog-walk price was about €10 per walk as of November 2026, and most bookings fall between €7 and €18 (Rover lists the average Madrid walk at €10 per walk, dated November 2026, with most bookings between €7 and €18. [S1])\n- A 2026 Madrid guide puts a 30-minute individual walk at roughly €10–15 and a 60-minute walk at €18–25 (Whopaws' 2026 Madrid guide gives a typical individual 30-minute walk at 10 to 15 euros and a 60-minute walk at 18 to 25 euros. [S2])\n- The same 2026 guide prices group walks at €8–12 for 45–60 minutes, which signals a cheaper tier for the app to consider (Group walks are cheaper, with rates from 8 to 12 euros per session of 45 to 60 minutes. [S2])\n- A 2026 Cronoshare guide says a Madrid walker might charge €7–10 per hour, rising to around €15 on holidays, weekends, or special schedules (Cronoshare says Madrid walkers could charge 7 to 10 euros an hour, with prices around 15 euros for holidays, weekends or special schedule requests. [S3])\n- A Santevet table lists Madrid at €11 per hour with a €6–15 range, with the highest prices in the centre and on holidays; the article has no clear publication year, so treat it as undated (Santevet's city table lists Madrid at 11 euros per hour, with a range of 6 to 15 euros, and higher prices in the centre and on holidays. [S4])\n- Individual profiles on Appwebel's Salamanca listings show hourly rates from €10 to €25, with some at €50; the page has no clear year, so treat it as undated (One Salamanca listing shows an hourly rate of 50 euros, while others on the same page charge 10 to 25 euros. [S5])\n- Platform commission or take rate for Madrid dog-walking apps: not found in the search results, so the net price the app keeps per booking is unverified.\n- Madrid-specific prices and commissions: not found. Every pricing source I found covers the US market, so none of these figures is a Madrid price.\n- Rover in Spain: its Spanish App Store listing gives a Spain-based support phone number (+34) and email, which suggests a Spanish presence (review dated 2023). Si tienes dudas contáctanos por chat en rover.com/help, teléfono +34 910 78 07 83 o email a ayuda-es@rover.com. [S6]\n- Rover commission (2026): Rover operates on roughly a 31% fee stack, a 20% provider fee plus an 11% owner booking fee, while Wag takes up to 40% from walkers. [S7] Other 2026 sources give a 15–20% walker fee instead, so the owner-side 11% is not confirmed.\n- Wag commission (year not stated): one source says Wag takes a hefty 40% cut of your services. [S8] Another, which is undated, says Wag: Charges a flat 25% commission on walks and 20% on sits. [S9] The two conflict, and I could not resolve the discrepancy.\n- Owner prices, Rover (2026): Rover drop-in visits run about $15 to $30 and house sitting about $25 to $75 per night, while Wag's equivalents tend to run slightly lower at roughly $12 to $25 and $20 to $60. [S7]\n- Owner cost per walk (2026): in one 2026 cost breakdown of a $30 walk, Rover typically charges the owner around $33.30 and the walker keeps about $24, while Wag shows roughly $30 to the owner and the walker keeps about $18. [S7]\n- Market scale (2026): Rover and Wag dominate the dog walking app market, processing over 20 million bookings per year combined. [S10] This is a secondary-source estimate, and it is not Madrid data.\n- Commission-free alternatives (2026): 0% commission on direct bookings; current subscription price on pricing page. | SnoutWalker also publicly says zero commission and subscription pricing. [S11] These are booking-software vendors, not a marketplace like the apps above.",
   "money": "- Contribution rate for 2026: Bankinter's 2026 guide puts the total contribution at 31.4% of the contribution base, of which 28.3% goes to common contingencies. [S19] Infoautónomos instead applies a 31.5% contribution rate to the base chosen within the worker's bracket. [S20] The sources disagree by 0.1 point, so verify the exact rate with Seguridad Social before modelling.\n- Minimum monthly fee for 2026: Infoautónomos lists a minimum fee between 205 and 607 euros depending on the income bracket. [S20] It also states there are no changes in the 2026 contribution table compared with 2025, apart from the top bracket limits and a 0.1% MEI increase. [S20]\n- Flat-rate start-up fee (tarifa plana), 2026: Infoautónomos says it is usually around 80 euros a month for the first 12 months, regardless of income. [S20] Bankinter's eligibility condition is that the person was not registered in RETA in the two years before the new registration and has no debts with Social Security or the tax agency. [S19]\n- General liability insurance for self-employed workers, 2026: Corredurías gives 120 to 400 euros a year for professional liability. [S21] Segurfer gives a wider range of 80 to 300 euros a year for self-employed workers [S22], and 150 to 350 euros a year for a low-risk self-employed service. [S22] The ranges differ, so treat them as indicative.\n- Dog-walker-specific liability policy: Petplan advertises a policy from 98.5 euros a year [S23] for dog walkers. This is a single insurer's list price, not a market survey.\n- Injury cover for the walker: Mutua Fácil states that wages during an illness or work injury come from the mutua's professional-contingency cover under the RETA contribution, not from the liability (RC) policy. [S24] Walkers therefore need to budget for their own injury income separately from the RC premium.\n- Owner-side requirement in Madrid (demand side, not walker cost): one commercial guide says that Madrid already requires liability insurance for any dog [S25] as of April 2026. This is a single secondary source and should be checked against the Comunidad de Madrid's rules.\n- Not found: the search returned no data on platform commission or take rates for dog-walking apps, nor on Madrid hourly walker prices, so the platform margin cannot be estimated from these results.",
   "risks": "- The Madrid city animal ordinance dates from 2001 and has since been amended in places. Fundamento legal: Ordenanza Reguladora de la Tenencia y Protección de los Animales, de 26 de julio de 2001. [S26]\n- Households in Madrid city may keep at most five dogs or cats without municipal authorisation (ordinance text, 2001). This limit concerns home keeping, not walkers. En el caso de perros y gatos su número no será superior a cinco sin la correspondiente autorización sanitaria. [S27]\n- Leash rules: dogs in shared public spaces must stay under control. Potentially dangerous breeds need a muzzle and a leash under two metres, and must be handled by an adult (Madrid city summary, undated). Los animales potencialmente peligrosos cuando salgan a espacios públicos o privados de uso común se realizaran bajo una persona mayor de edad, siendo obligatorio la utilización de una correa de menos de dos metros y bozal adecuado. [S27]\n- Off-leash hours in parks, per the ordinance (2025 article): los perros pueden estar sueltos en parques y jardines públicos entre las 19:00 y las 10:00 horas en horario de invierno, y de 20:00 a 10:00 horas durante el horario de verano [S28].\n- Dog identification: Los perros deben estar identificados con microchip, inscritos en el Registro de Identificación de Animales de Compañía (RIAC) y contar con una cartilla sanitaria actualizada. [S28] (2025 article; the ordinance text itself was not checked.)\n- Civil liability insurance is described as mandatory for dog owners in Madrid, though the source is undated and appears to be about 2022. un seguro de responsabilidad civil. [S29] The source does not say whether this applies to a paid walker.\n- Business registration: a regional-level register for economic animal activities exists, but the source is a non-Madrid-city ordinance (year not stated). deberán darse de alta en el Registro de Actividades Económico Pecuarias de la Comunidad de Madrid, tal y como establece el Decreto 176/1997 [S30]. Whether this covers dog walking is not confirmed.\n- Not found: any Madrid city rule capping the number of dogs one walker may handle; any Madrid city licence specifically for dog-walking businesses; and any Madrid city registration rule for walkers. Arganda del Rey's ordinance requires a municipal opening licence for paid animal-keeping regardless of animal count (2010s text, undated), but Arganda is not Madrid city, so it is only a comparison point.\n\nNote: all of this comes from search snippets, not full ordinance texts. Before committing savings, a lawyer or the Madrid city council should confirm how the ordinance applies to paid walkers.\n- In 2020, Spain's Supreme Court (Judgement 805/2020, 25 September) held that Glovo's riders were employees, not self-employed or economically dependent workers. On 25 September 2020, the Spanish Supreme Court (Judgement N. 805/2020) ruled that riders of the delivery company, Glovo, are employees and not self-employed workers or economic dependent self-employed workers. [S31]\n- The 2021 Ley Rider (Real Decreto 9/2021) took effect in August 2021 and sets a presumption of employment for platform couriers. This law (Real Decreto 9/2021), popularized as Ley Rider, finally entered into force in August of the same year. [S32]\n- Under the 2021 law, the platform bears the burden of proving a worker is self-employed. For riders organised by an algorithm through a digital platform, the law presumes an employment relationship exists, and it puts the burden on the platform to prove otherwise. [S33] (Year of source article not stated; the rule dates from 2021.)\n- Enforcement cost: the labour inspectorate pursued platforms for back social-security contributions on riders invoicing as autónomos, and Glovo eventually moved its riders to employment contracts. Year not given in the source. The labour inspectorate, the Inspección de Trabajo y Seguridad Social (ITSS), pursued platforms for back social-security contributions on riders who had been invoicing as autónomos, and Glovo eventually moved its riders onto employment contracts. [S33]\n- Platform control is a key test: the Supreme Court's view, reported in 2021, is that ownership of the app and its algorithm, which set prices and connect clients and workers, can establish subordination. As long as Glovo owns the application and its algorithm, which are the means to connect clients and riders and calculate the prices of the delivery—even if these can be slightly adjusted—there will be subordination and thus an employment relationship. [S34] This matters for a booking app that sets rates and matches walkers.\n- Scope limit: the sources cover food-delivery couriers, and nothing I found applies the Ley Rider to dog walkers or other by-the-hour service bookings in Madrid. Not found: any ruling or rule on dog walkers specifically, and any Madrid or Spanish liability-insurance requirement for dog walkers.\n- Enforcement history: Spain's labour inspectorate has fined Glovo repeatedly since the Rider Law, according to a EUobserver report (year not stated in source). Spain's labour inspectorate has issued numerous fines to Glovo while courts have repeatedly decided in favour of workers claiming their status as employees. [S35]\n- Industry counterpoint: Glovo's parent company disputes the bogus self-employment claims, saying it complied with the rules (EUobserver, year not stated). For its part, a spokesperson from Berlin-based Delivery Hero, Glovo's parent company, told EUobserver that Glovo has always complied with applicable regulations in Spain, both after the Supreme Court ruling and the rider law. [S35]"
  },
  "sources": [
   {
    "id": "S1",
    "url": "https://www.rover.com/es/madrid--comunidad-de-madrid--paseador-de-perros/",
    "title": "Los Mejores Paseadores De Perros En madrid"
   },
   {
    "id": "S2",
    "url": "https://www.whopaws.com/es/blog/paseador-perros-madrid",
    "title": "Paseador de Perros Confianza Madrid 2026"
   },
   {
    "id": "S3",
    "url": "https://www.cronoshare.com/cuanto-cuesta/paseador-perros",
    "title": "¿Cuánto cuesta un paseador de perros? Precios en 2026"
   },
   {
    "id": "S4",
    "url": "https://www.santevet.es/articulo/Paseador-de-perros",
    "title": "Paseador de perros: cuánto cobra y qué servicios ofrece"
   },
   {
    "id": "S5",
    "url": "https://appwebel.com/servicios/paseo-de-perros-domicilio/madrid/b/barrio-de-salamanca",
    "title": "Paseador de perros a domicilio en Barrio de Salamanca"
   },
   {
    "id": "S6",
    "url": "https://apps.apple.com/es/app/rover-dog-sitters-walkers/id547320928",
    "title": "App Rover: Cuidado de mascotas - App Store"
   },
   {
    "id": "S7",
    "url": "https://sidewalkdog.com/articles/rover-or-wag-best-app-for-dog-owners",
    "title": "Rover vs Wag: Which Dog Walking App Is Best in 2026?"
   },
   {
    "id": "S8",
    "url": "https://www.nerdwallet.com/finance/learn/rover-vs-wag",
    "title": "Rover vs. Wag: Which App Is Better for Making Money? - NerdWallet"
   },
   {
    "id": "S9",
    "url": "https://petcaresouthtyneside.co.uk/rover-vs-wag-which-platform-is-better-for-dog-walkers-and-pet-sitters",
    "title": "Rover vs Wag: Which Platform Is Better for Dog Walkers and Pet ..."
   },
   {
    "id": "S10",
    "url": "https://hushku.app/resources/best-dog-walking-apps",
    "title": "Best Dog Walking Apps 2026: Rover vs Wag and More"
   },
   {
    "id": "S11",
    "url": "https://getdogwalkr.com/blog/commission-free-dog-walking-app/",
    "title": "Commission-Free Dog Walking App: What Walkers Should Compare"
   },
   {
    "id": "S12",
    "url": "https://www.madridesnoticia.es/2025/03/perros-y-gatos-en-madrid/",
    "title": "El censo de perros y gatos en Madrid"
   },
   {
    "id": "S13",
    "url": "https://theobjective.com/economia/2026-10-16/espana-hogares-mascotas-bebes-filon-comercial/",
    "title": "Revolución animal: los hogares con mascota casi duplican a los ..."
   },
   {
    "id": "S14",
    "url": "https://dogeats.in/es/estadisticas/hogares-con-mascotas/",
    "title": "Hogares con mascotas en México, España y Chile: datos 2026"
   },
   {
    "id": "S15",
    "url": "https://www.consalud.es/animalcare/mascotas/el-gasto-en-mascotas-aumenta-en-los-hogares-espanoles-la-rioja-la-comunidad-que-mas-invierte.html",
    "title": "La Rioja lidera el gasto en mascotas en hogares españoles y ..."
   },
   {
    "id": "S16",
    "url": "https://ipmark.com/informes/mascotas-2025/",
    "title": "Informe IPMARK"
   },
   {
    "id": "S17",
    "url": "https://www.ifema.es/iberpet/noticias-sector/el-mercado-espanol-de-petcare",
    "title": "El mercado español de petcare"
   },
   {
    "id": "S18",
    "url": "https://www.thewalkingdog.es/blog/hogares-perro-madrid-censo/",
    "title": "Hogares con perro en Madrid. Un resumen 2014 - 2024"
   },
   {
    "id": "S19",
    "url": "https://www.bankinter.com/blog/empresas/cuota-autonomos",
    "title": "¿Cuál es la cuota de autónomos en 2026?"
   },
   {
    "id": "S20",
    "url": "https://www.infoautonomos.com/seguridad-social/cuota-de-autonomos-cuanto-se-paga/",
    "title": "Cuota de autónomos 2026: ¿cuánto se paga? - Infoautónomos"
   },
   {
    "id": "S21",
    "url": "https://corredurias.org/articulo/mejor-seguro-autonomos-2026",
    "title": "Mejor seguro para autónomos 2026"
   },
   {
    "id": "S22",
    "url": "https://www.segurfer.es/seguros/rc/seguro-de-responsabilidad-civil-calcular-precio",
    "title": "Seguro de Responsabilidad Civil, Calcular Precio"
   },
   {
    "id": "S23",
    "url": "https://petplan.es/pro/seguro-paseadores-de-perros.html",
    "title": "Seguro para Paseadores de Perros - Petplan"
   },
   {
    "id": "S24",
    "url": "https://mutuafacil.es/guias-y-recursos/seguro-responsabilidad-civil-autonomos/",
    "title": "Seguro de responsabilidad civil para autónomos 2026"
   },
   {
    "id": "S25",
    "url": "https://www.seguroperrosppp.com/obligatorio-seguro-perros/",
    "title": "Seguro para perros obligatorio en España: Guía 2026 por CCAA"
   },
   {
    "id": "S26",
    "url": "https://sede.madrid.es/portal/site/tramites/menuitem.62876cb64654a55e2dbd7003a8a409a0/?vgnextoid=af66a14cf6c4e210VgnVCM2000000c205a0aRCRD&vgnextchannel=e309a38813180210VgnVCM100000c90da8c0RCRD&vgnextfmt=pd",
    "title": "Animales. Solicitud Licencia Administrativa Tenencia de Animales ..."
   },
   {
    "id": "S27",
    "url": "https://www.madrid.es/portales/munimadrid/es/Inicio/Servicios-sociales-y-salud/Salud/Servicios-Veterinarios/?vgnextoid=5239b2da2548a010VgnVCM100000d90ca8c0RCRD&vgnextchannel=0815c8eb248fe410VgnVCM1000000b205a0aRCRD&idCapitulo=1213355",
    "title": "Servicios Veterinarios - Resumen de la Ordenanza Reguladora de ..."
   },
   {
    "id": "S28",
    "url": "https://www.estrelladigital.es/articulo/vida/normas-pasear-perros-madrid/20250525133912431585.html",
    "title": "Normas para pasear a los perros en Madrid"
   },
   {
    "id": "S29",
    "url": "https://www.trendencias.com/familia-maternidad-y-ninos/todo-que-tienes-que-saber-quieres-llevar-a-tu-perro-suelto-madrid",
    "title": "Todo lo que tienes que saber si quieres llevar a tu perro suelto ..."
   },
   {
    "id": "S30",
    "url": "https://www.vvapardillo.org/images/doc/ordenanzas/nofiscales/ordnofiscal05.pdf",
    "title": "ORDENANZA REGULADORA DE ANIMALES ..."
   },
   {
    "id": "S31",
    "url": "https://industrialrelationsnews.ioe-emp.org/industrial-relations-and-labour-law-october-2020/news/article/spain-supreme-court-decision-on-the-employment-status-of-workers-for-a-delivery-company-and-social-dialogue-process-on-a-riders-law",
    "title": "Spain: Supreme Court decision on the employment status of workers ..."
   },
   {
    "id": "S32",
    "url": "https://academic.oup.com/ser/article/23/2/877/7863433",
    "title": "times, are they changing? Examining platform companies' chameleonic ..."
   },
   {
    "id": "S33",
    "url": "https://fluxpayroll.ai/blog/spain-platform-worker-protections-article/",
    "title": "Spain's Ley Rider: when a delivery app's contractors are presumed ..."
   },
   {
    "id": "S34",
    "url": "https://www.socialeurope.eu/platforms-put-a-spoke-in-the-wheels-of-spains-riders-law",
    "title": "Platforms put a spoke in the wheels of Spain’s ‘riders’ law’ ..."
   },
   {
    "id": "S35",
    "url": "https://euobserver.com/100/eu-gig-workers-still-exploited-despite-landmark-laws/",
    "title": "EU gig-workers still exploited, despite landmark laws"
   }
  ],
  "writer": "# Founder report: Hourly vetted dog-walker booking app in Madrid\n\n## Executive summary\n\nThe idea targets a real market: Madrid city had 323,175 registered dogs in 2024 [S12]. Demand is not yet proven, though. No source gives the number of Madrid dog-owning households, and the Madrid spending figures conflict [S14][S15]. The strongest evidence for the idea is that walk prices are established and visible across several Madrid guides, at about €10–25 per walk-hour [S1][S2][S4]. The strongest evidence against it is legal. Spain's Ley Rider presumes employment for platform-managed workers, and courts have treated app control over pricing and matching as a sign of employment [S32][S34]. No source covers dog walkers under that rule, so the risk is unresolved. Competitors Rover and Wag already take large commissions, and the Madrid platform commission is unverified [S7][S9]. On the money side, the planned unit is one booked walk-hour at an assumed €18 gross price, with a 25% share kept. Contribution per unit is €2.92. Fixed costs are €598 per month. Break-even is 205 booked walk-hours per month, and startup capital is €17,300. Verdict: do not put savings into building the app until the three validations below pass.\n\n## Verdict\n\n**GO WITH CONDITIONS**\n\n- Demand is plausible but unmeasured. Madrid city has 323,175 registered dogs [S12], but no Madrid household count exists in the research.\n- Walk prices are established. Madrid guides put a 60-minute individual walk at €18–25 [S2] and a typical hourly walker rate at €7–15 [S3][S4]. The gap between those figures is the price test.\n- Legal exposure is the largest unknown. The Ley Rider presumes employment for platform-managed workers [S32], and the Supreme Court has pointed to app control over prices and matching as a sign of subordination [S34]. No source confirms whether this reaches dog walkers.\n- Platform economics are unverified. Rover and Wag take between 20% and 40% from providers [S7][S8][S9], and no Madrid commission data was found. The 78% contribution margin depends on a share-kept estimate.\n- Savings should not fund the build before the legal opinion and the willingness-to-pay test are complete.\n\n## 3 things to validate first\n\n**1. Madrid owners will pay about €18 per walk-hour and rebook.**\n- Why it matters: the model assumes €18 gross per booked walk-hour [S2, estimate]. If owners will pay only €10–12, which is closer to Rover's average walk price of €10 [S1] and Santevet's €11 per hour [S4], contribution falls and break-even moves well above 205 walk-hours per month.\n- Cheapest test this month: interview 40 Madrid dog owners and show them a booking screen at €18 for one hour and at €12 for 30 minutes. Ask each to book a paid pilot walk.\n- Pass: at least 12 of 40 (30%) complete a paid pilot booking at €18 and at least 3 say they would rebook weekly.\n- Fail: fewer than 12 pay, or most pick the €12 option. Re-price or narrow the offer before building.\n\n**2. The model does not make walkers employees under Spanish law.**\n- Why it matters: if a court treats walkers as employees, the platform carries back social-security and employment liability. Glovo faced repeated inspections and fines on this basis [S33][S35]. The model fails if the platform sets rates and controls schedules.\n- Cheapest test this month: get a written opinion from a Spanish labour lawyer on a draft model in which walkers set their own hourly rates, accept or decline bookings freely, and hold their own autónomo registration. Then interview 15 Madrid walkers and ask whether they would work on those terms.\n- Pass: the lawyer's written opinion says the model is defensible, and at least 10 of 15 walkers say they would work on those terms.\n- Fail: the lawyer says the model is high risk, or fewer than 10 walkers accept. Do not build until the model changes or the risk is accepted in writing.\n\n**3. Enough walkers will supply at a 25% platform share.**\n- Why it matters: the economics assume the platform keeps 25% of the net price [S9, estimate]. If walkers refuse that share, or if supply in the first two districts is thin, the app cannot fill bookings.\n- Cheapest test this month: put a one-page offer to 20 Madrid walkers. Show them the share kept, the insurance requirement (liability cover from about €98.50 per year [S23]), and the vetting steps. Ask for a commitment to take bookings in two named districts.\n- Pass: at least 8 of 20 (40%) commit in writing, covering at least two districts.\n- Fail: fewer than 8 commit. Test a lower or higher share before building.\n\n## Customers & demand\n\n**Takeaway:** Madrid has a large registered dog population, but the research cannot size the number of households that would book a walker. Demand is plausible and unmeasured.\n\n**Evidence:**\n- Madrid city had 323,175 registered dogs in the 2024 census, about one dog for every 11 residents [S12].\n- Spain had about 7.56 million dogs in 2025 [S13].\n- Average Spanish pet spending is 1,908 € per dog per year, about 159 € per month [S16].\n- Spanish household pet spending averaged 315.35 € in 2025 [S14]. Madrid's figure is 381.38 € in one source [S15] and 323.03 € in another [S14]. The two Madrid figures conflict and use different years, so I would not rely on either.\n- The share of households with a pet is disputed. One IFEMA-cited study gives 54% [S17]. AMVAC data gives more than 40% [S15]. Neither is Madrid-specific or dated to the same year.\n- The research found no count of Madrid dog-owning households. A blog estimate of 1.3 dogs per household exists [S18], but it comes from a 2014 study, so I would not use it.\n\n**Key numbers:**\n\n| Figure | Value | Source or \"estimate\" |\n|---|---|---|\n| Registered dogs, Madrid city (2024) | 323,175 | S12 |\n| Residents per dog, Madrid city | About 11 | S12 |\n| Dogs, Spain (2025) | 7.56 million | S13 |\n| Pet spending per dog, Spain | 1,908 €/year (about 159 €/month) | S16 |\n| Pet spending per household, Spain (2025) | 315.35 € | S14 |\n| Pet spending per household, Madrid | 381.38 € or 323.03 €, conflicting | S15 / S14 |\n| Households with a pet, Spain | 54% (IFEMA study) or more than 40% (AMVAC) | S17 / S15 |\n| Madrid dog-owning households | Not found | None |\n\n**What it means for you:** The city-level dog count is large enough to test a small launch in two or three districts. The household count is the key missing number, and you must get it from a survey or a pilot before modelling demand. Treat the spending figures as context only, because the Madrid numbers disagree.\n\n**Next actions:**\n1. Run 40 owner interviews across at least two Madrid districts and record how often each owner currently pays for a walk.\n2. Ask the Madrid city council or the Comunidad de Madrid whether a dog-owning household count exists in a public dataset, and record the answer.\n3. Set up a one-page pre-booking form with the €18 price and collect sign-ups from owners who want an alert at launch.\n\n## Competition & alternatives\n\n**Takeaway:** Madrid walk prices are visible across several sources, mostly at €7–25 per hour. Rover and Wag dominate the category, and their commissions are the main cost benchmark. Madrid-specific commission data was not found.\n\n**Evidence:**\n- Rover's average Madrid walk is about €10, and most bookings fall between €7 and €18 [S1]. The walk length is not stated.\n- A 2026 Madrid guide lists a 30-minute individual walk at €10–15 and a 60-minute walk at €18–25 [S2]. It lists group walks at €8–12 for 45–60 minutes [S2].\n- Cronoshare says Madrid walkers charge €7–10 per hour, rising to about €15 on weekends and holidays [S3]. The Santevet table is undated and lists Madrid at €11 per hour, in a €6–15 range [S4].\n- Rover's commission is reported as a 31% fee stack, a 20% provider fee plus an 11% owner fee [S7]. Another 2026 source gives a 15–20% walker fee instead, so the owner-side 11% is not confirmed [S7].\n- Wag's commission conflicts across sources: 40% [S8] in one and a flat 25% on walks [S9] in another. The second source is undated.\n- Rover and Wag together process more than 20 million bookings a year [S10]. This is a secondary estimate, and it is not Madrid data.\n- Rover has a Spanish support line and email, which suggests a Spanish presence [S6]. Commission-free booking software exists, but these are software tools, not marketplaces [S11].\n- Every pricing source found covers either the US market or a Madrid market with no clear date. No Madrid commission data was found.\n\n**Key numbers:**\n\n| Figure | Value | Source or \"estimate\" |\n|---|---|---|\n| Rover average Madrid walk | About 10 € per walk (most 7–18 €) | S1 |\n| Madrid 30-minute individual walk | 10–15 € | S2 |\n| Madrid 60-minute individual walk | 18–25 € | S2 |\n| Madrid group walk (45–60 min) | 8–12 € | S2 |\n| Madrid hourly walker rate | 7–10 € (about 15 € on weekends) | S3 |\n| Madrid hourly rate, Santevet (undated) | 11 € (range 6–15 €) | S4 |\n| Rover fee stack | About 31% (20% provider + 11% owner) | S7 (conflicting) |\n| Wag commission | 25% (walks) or 40%, conflicting | S9 / S8 |\n| Madrid platform commission | Not found | None |\n| Gross price per walk-hour used in model | 18 € incl. VAT | Estimate, based on S2 |\n\n**What it means for you:** The 18 € model price sits at the low end of the 60-minute Madrid range [S2], but above the typical walk price on Rover [S1] and the hourly rates in [S3] and [S4]. Your price is a bet that owners will pay for vetting and reliability. The competitor commission range is wide, so the share you keep is a key input that you must test rather than assume.\n\n**Next actions:**\n1. Mystery-book three Rover walks in Madrid and record the price, walk length, and fees shown at checkout.\n2. Email Rover's and Wag's Spanish support teams to ask about commissions for Madrid walkers, and record the answers.\n3. Collect five Madrid walker profiles on Appwebel and Whopaws and record hourly rates, years of experience, and whether they are registered as autónomos.\n\n## Money\n\n**Takeaway:** The model keeps a share of each booked walk-hour. Contribution is positive only if the kept share covers payment costs and fixed costs. Break-even is 205 booked walk-hours per month. The share kept and the price are unverified and drive the result.\n\n**Evidence:**\n- The 2026 total contribution rate for self-employed workers is 31.4% per Bankinter [S19] and 31.5% per Infoautónomos [S20]. Verify the exact rate with Seguridad Social before modelling.\n- The minimum monthly fee for self-employed workers in 2026 ranges from 205 € to 607 € depending on income bracket [S20]. The lowest bracket is used in the model as the conservative fixed cost.\n- The flat-rate start-up fee is about 80 € per month for the first 12 months [S20]. Eligibility requires no RETA registration in the prior two years and no Social Security or tax debts [S19].\n- Liability insurance for self-employed workers ranges from 120 to 400 € per year [S21] or from 80 to 300 € per year [S22]. The model uses the upper bound from S21 for prudence (estimate).\n- A dog-walker-specific liability policy from Petplan starts at 98.50 € per year [S23]. This is a single insurer's list price, not a market survey.\n- A walker's income during illness or work injury comes from the mutua's professional-contingency cover under the RETA contribution, not from the liability policy [S24]. Walkers must budget for injury income separately.\n- A commercial guide says Madrid already requires liability insurance for any dog, as of April 2026 [S25]. This is one secondary source and must be checked against Comunidad de Madrid rules.\n- No source gives a platform commission or take rate for dog-walking apps in Madrid. The platform margin is therefore an estimate.\n\n**Key numbers:**\n\n| Figure | Value | Source or \"estimate\" |\n|---|---|---|\n| Total self-employed contribution rate (2026) | 31.4% (Bankinter) or 31.5% (Infoautónomos) | S19 / S20 |\n| Minimum monthly fee, lowest bracket | 205 € | S20 |\n| Flat-rate start-up fee | About 80 €/month for 12 months | S20 |\n| Liability insurance, upper bound | 400 €/year | S21 |\n| Dog-walker liability policy (single insurer) | From 98.50 €/year | S23 |\n| Platform share kept per booking | 25% | Estimate, based on S9 and S7 |\n| VAT rate on the service | 21% | Estimate. Not in the research notes; verify |\n| Gross price per walk-hour | 18 € | Estimate, based on S2 |\n\n**Unit economics**\n\nThe unit is one booked walk-hour. The business keeps a commission on that booking. The customer price is 18 € including VAT, which is an estimate based on the low end of the Madrid 60-minute range [S2]. VAT is set at 21%, which is an estimate and is not in the research notes, so verify it before use. Net revenue is the gross price less VAT. The business keeps a 25% share of that net price, which is an estimate based on the flat 25% walk commission quoted for Wag [S9] and Rover's 20% provider fee [S7]. The walker receives the rest, so walker pay is not a business cost. Variable cost is payment processing at 0.80 € per booking, which is an estimate. Fixed monthly costs are the lowest-bracket RETA minimum of 205 € [S20], liability insurance of about 33 € per month (400 € per year ÷ 12) [S21], software and hosting of 60 € per month (estimate), and launch marketing of 300 € per month (estimate). Startup costs are app build of 12,000 € (estimate), legal and registration of 1,500 € (estimate), walker vetting and onboarding of 800 € (estimate), and launch marketing of 3,000 € (estimate). The tarifa plana [S20] would lower the RETA line in year one, but the model does not use it, so the figures are conservative.\n\n- Net revenue per walk-hour: €3.72\n- Variable cost per walk-hour: €0.80\n- Contribution per walk-hour: €2.92\n- Contribution margin: 78%\n- Fixed costs per month: €598\n- Break-even: 205 booked walk-hours per month\n- Startup capital: €17,300\n\n**What it means for you:** The model depends on two inputs with no Madrid source: the share kept and the price. The break-even figure above is only as good as those inputs. The insurance and social-security lines are the fixed costs you can verify most easily. Your RETA cost will rise after the first year, so budget for the minimum bracket, not the flat-rate fee.\n\n**Next actions:**\n1. Get written quotes from two Spanish insurers for a platform liability policy covering walkers and owners, and record the premium.\n2. Confirm the 2026 contribution rate with Seguridad Social or a gestoría, and replace the 31.4%/31.5% range with one figure.\n3. Model two scenarios in a spreadsheet: a 25% share at 18 €, and a 15% share at 12 €. Record which inputs change break-even.\n\n\n## Risks & how to start\n\n**Takeaway:** The main risk is legal, not technical. The Ley Rider's presumption of employment and the app-control test may apply to a booking platform. Madrid's animal rules also apply to walkers and owners, and several points are unconfirmed.\n\n**Evidence:**\n- Spain's Supreme Court ruled in 2020 that Glovo's riders were employees, not self-employed workers [S31].\n- The 2021 Ley Rider (Real Decreto 9/2021) presumes employment for platform-organised workers. The burden of proof falls on the platform [S32][S33].\n- The Supreme Court has said that a platform owning the app and algorithm that set prices and connect workers and clients can establish subordination [S34]. This matches the design of a booking app that sets rates and matches walkers.\n- The labour inspectorate pursued platforms for back social-security contributions on riders invoicing as autónomos. Glovo later moved its riders to employment contracts [S33]. Glovo has been fined repeatedly [S35]. Glovo's parent disputes the claims and says it complied with the rules [S35].\n- The sources cover food-delivery couriers only. None applies the Ley Rider to dog walkers or to hourly service bookings in Madrid.\n- Madrid's 2001 animal ordinance applies. Households may keep at most five dogs or cats without municipal authorisation. This limit concerns home keeping, not walkers [S26][S27].\n- Potentially dangerous breeds must be walked by an adult, on a leash under two metres, with a muzzle [S27].\n- Off-leash hours in parks run from 19:00 to 10:00 in winter and from 20:00 to 10:00 in summer [S28]. This is from a 2025 article and was not checked against the ordinance.\n- Dogs must be microchipped, registered in the RIAC, and have an up-to-date health record [S28].\n- A source says civil liability insurance is mandatory for dog owners in Madrid. The source is undated, appears to be from about 2022, and does not say whether it applies to a paid walker [S29].\n- A regional register for economic animal activities may apply to walking. The source is from another municipality, and its application to dog walking is not confirmed [S30]. No Madrid city licence or registration rule for dog walkers was found, and no cap on dogs per walker was found.\n\n**Key numbers:**\n\n| Figure | Value | Source or \"estimate\" |\n|---|---|---|\n| Madrid city household dog limit (without authorisation) | 5 dogs or cats | S27 (home keeping only) |\n| Leash length for dangerous breeds | Under 2 m, with muzzle | S27 |\n| Off-leash hours in parks (winter / summer) | 19:00–10:00 / 20:00–10:00 | S28 |\n| Madrid walker licence or cap on dogs | Not found | None |\n| Ley Rider employment presumption | Applies to platform couriers; dog walkers not covered by sources | S32, S33 |\n\n**What it means for you:** Do not launch the platform until a Spanish labour lawyer has reviewed the exact model, including how walkers set rates and accept bookings. Treat the Madrid animal rules as a checklist to confirm with the city council, not a settled legal position. The Glovo history shows that enforcement can follow a platform that controls pricing and matching.\n\n**Next actions:**\n1. Book a consultation with a Spanish labour and platform lawyer, and send them the draft booking flow and the walker terms. Ask for a written opinion on classification.\n2. Email the Comunidad de Madrid and Madrid city council animal welfare office to ask whether paid walkers need a licence, a registration, or liability insurance, and record the reply.\n3. Draft a walker onboarding checklist covering microchip, RIAC registration, vaccination record, and insurance, and test it with five walkers.\n\n**How to start:** Before any build spend, complete the three validations above. Build a manual pilot first: match owners with walkers through a shared form or chat, with no automated pricing or scheduling, in one Madrid district. Move to an app only after the legal opinion is in hand and the pilot shows repeat bookings.\n\n```econ\n{\"unit\":\"one booked walk-hour (the business keeps a commission)\",\"price_per_unit_gross_eur\":18,\"vat_rate\":0.21,\"share_kept\":0.25,\"variable_costs_per_unit\":[{\"item\":\"payment processing\",\"eur\":0.8,\"source\":\"estimate\"}],\"fixed_monthly_costs\":[{\"item\":\"RETA self-employed minimum (lowest bracket)\",\"eur\":205,\"source\":\"S20\"},{\"item\":\"liability insurance (400 €/yr ÷ 12)\",\"eur\":33,\"source\":\"S21\"},{\"item\":\"software and hosting\",\"eur\":60,\"source\":\"estimate\"},{\"item\":\"launch marketing\",\"eur\":300,\"source\":\"estimate\"}],\"startup_costs\":[{\"item\":\"app MVP build\",\"eur\":12000,\"source\":\"estimate\"},{\"item\":\"legal and registration\",\"eur\":1500,\"source\":\"estimate\"},{\"item\":\"walker vetting and onboarding\",\"eur\":800,\"source\":\"estimate\"},{\"item\":\"launch marketing (one-off)\",\"eur\":3000,\"source\":\"estimate\"}],\"scores\":{\"customers\":6,\"competition\":5,\"money\":4,\"risks\":4},\"scalability\":{\"reach\":6,\"repeatable\":7,\"margins\":5,\"founder_free\":5,\"digital\":8,\"reach_label\":\"City\",\"why\":\"The app copies to other cities, but each needs its own vetted walkers.\",\"would_scale\":[\"Open a second Spanish city once Madrid passes break-even\",\"Add pet-sitting on the same walkers\"]}}\n```\n"
 }
};
