// The site's content as it stood on 2026-11-11, transcribed from legacy/index.html and
// legacy/partners.html. Image values are file names in seed/images; scripts/seed.mjs swaps
// them for media keys. Only used to create the first draft and release.

const ZEFFY = "https://www.zeffy.com/en-US/ticketing/strategies-for-saving-our-colleges-a-new-york-metro-coalition-for-higher-ed-forum";

export const blocks = {
  site_title: "NY Metro Coalition for Higher Education",
  site_description: "A united network of faculty, staff, and student worker unions and advocacy groups fighting for academic freedom and economic equity in the NYC Metro.",
  share_image: "",
  logo_small: "NY Metro CHE Logo trans.png",
  logo_large: "NY Metro CHE Logo.png",
  ticker: "DEFEND THE RIGHT TO LEARN\nHANDS OFF HIGHER ED\nPROTECT ACADEMIC FREEDOM",
  hero_line1: "DEFEND THE",
  hero_line2: "RIGHT TO LEARN",
  hero_tagline: "A united network of faculty, staff, and student worker unions and advocacy groups fighting for academic freedom and economic equity in the NYC Metro.",
  who_intro: "The NY Metro Coalition for Higher Ed comprises faculty, staff, and student worker unions and advocacy groups from across the city and state.",
  mission_body: "The NY Metro Coalition for Higher Ed is a group of faculty, staff, and student worker unions and advocacy groups committed to advancing the right to learn, teach, research, associate, assemble, and dissent. We champion and defend the rights to academic freedom and freedom of speech as the cornerstone of higher education, crucial to the role of education in a just, democratic society. We stand against threats to ourselves and our educational institutions, which undermine or punish us for political speech, discriminate against us or harm us based on our identities or citizenship status, diminish our scientific, social, humanistic, and artistic research, or attack our rights. We believe in the necessity for greater economic equity within and across our institutions, and uphold a vision of higher education in which the pursuit of learning does not incur crippling debt. We are an advocacy network that shares resources and support through events and other platforms. We aim to enact changes within our institutions and at local and state levels that enshrine our rights, and pressure our institutional leaders to defend the autonomy of higher education.",
  mission_callout: "Our communities flourish when our universities thrive. We come together to build a future for higher education free from coercion, censorship, propaganda, transphobia, racism, and anti-immigrant hate. We are taking the fight to the State House, the White House, the boardroom, and the streets. We stand up for each other— because when we fight together, we win.",
  mission_photo: "IMG_5150.webp",
  footer_heading: "Join The Fight",
  footer_text: "When we come together, our power as workers and educators is greater than theirs. Organize with us.",
  contact_email: "contact@nymetrocoalition.org",
  contact_button: "Email Us Now",
  partners_intro: "Our movement extends beyond a single campus. We work closely with national, state, and local coalitions to defend higher education as a public good.",
};

export const events = [
  {
    title: "Strategies for", accent: "Saving Our Colleges", badge: "Forum",
    subtitle: "A New York Metro Coalition for Higher Ed Forum",
    start: "2026-11-16T18:30", end: "2026-11-16T20:30", time_note: "Free. Space is limited.",
    venue: "NYU Cantor Film Center", address: "Iris & B. Gerald Cantor Film Center, 36 E 8th St, New York, NY 10003",
    description: "What does worker power look like at New York’s colleges & universities? Join labor organizers from across the city, Anthony Perlstein from the Mayor’s Office of Worker Power, and Assemblymember Diana Moreno to discuss how labor can shape the future of Higher Education in NYC, the state, and across the country.\n\n**Join us to win a Higher Education that works for all!**",
    blurb: "A forum with labor organizers, Anthony Perlstein from the Mayor’s Office of Worker Power and Assemblymember Diana Moreno on how labor can shape the future of higher education.",
    cta_label: "Register Free", cta_url: ZEFFY, cta_note: "Please register with a non-.edu email",
    hosted_by: "Higher Education Labor United",
    poster: "nov-16-forum.jpg",
    poster_alt: "Strategies for Saving Our Colleges, November 16, 6:30 to 8:30 PM, NYU Cantor Film Center, 36 E. 8th St",
  },
  {
    title: "Hands Off", accent: "Higher Ed", badge: "May Day 2026",
    start: "2026-05-01T15:00", end: "2026-05-01T19:00",
    stops: [
      { time: "3:00 PM", place: "The New School", address: "University Center, 63 5th Ave", note: "Rally to defend higher ed jobs and build union power." },
      { time: "4:00 PM", place: "Washington Sq Park", address: "Garibaldi Statue", note: "Join other unions and groups." },
      { time: "5:15 PM", place: "March to Foley Sq", address: "Centre St and Worth St", note: "" },
    ],
    blurb: "Rally at The New School, gathering at Washington Square Park and march to Foley Square to defend higher ed jobs and build union power.",
    link_label: "labor4highered.org", link_url: "https://labor4highered.org",
    poster: "may-day-front.jpg", poster_alt: "Hands Off Higher Ed - May Day 2026 Front",
    poster_back: "may-day-back.jpg", poster_back_alt: "Hands Off Higher Ed - May Day 2026 Back",
  },
  {
    title: "Hands Off Higher Ed", start: "2025-11-07T11:00", end: "2025-11-07T13:00",
    venue: "Apollo Global Management", address: "9 West 57th St, Midtown",
    blurb: "Protest outside Apollo Global Management. Reject the Compact and oligarchic influence.",
    poster: "Apollo Management Poster.png", poster_alt: "Hands Off Higher Ed - Apollo Management",
    press: [
      { outlet: "NY Post", url: "https://nypost.com/2025/11/06/business/apollo-tells-nyc-workers-to-stay-home-as-it-braces-for-protest-over-marc-rowans-trump-support/" },
      { outlet: "NYU News", url: "https://nyunews.com/news/2025/11/10/aaup-protest-trump-compact-plan/" },
      { outlet: "Fordham Ram", url: "https://thefordhamram.com/news/aaup-protests-against-trump-admins-higher-ed-compact/" },
      { outlet: "NY Times", url: "https://www.nytimes.com/2025/11/24/us/billionaires-influence-universities-trump.html" },
    ],
  },
  {
    title: "Organizing Town Hall", start: "2025-10-28T18:30", end: "2025-10-28T20:30",
    venue: "NYU Cantor Center", address: "36 E. 8th St, 2nd floor",
    blurb: "Cross-institutional organizing meeting at the NYU Cantor Center to build power.",
    poster: "Townhall Poster.JPG", poster_alt: "Town Hall Organizing Meeting",
  },
  {
    title: "Rally for the Right to Learn!", start: "2025-04-17T15:00", end: "2025-04-17T18:00",
    venue: "Washington Square Park to Foley Square",
    blurb: "March from Washington Square Park and rally at Foley Square to defend academic freedom.",
    poster: "4_17 Poster.png", poster_alt: "Rally for the Right to Learn",
    press: [
      { outlet: "NY1", url: "https://ny1.com/nyc/manhattan/politics/2025/04/18/protesters-rally-against-federal-government-policy-demands-for-schools" },
      { outlet: "Indypendent", url: "https://indypendent.org/2025/04/higher-ed-unions-rally-in-foley-square-vow-to-meet-the-moment/" },
      { outlet: "AP", url: "https://apnews.com/article/education-freedom-speech-trump-c538cc12f04522d49c68b84a017df772" },
      { outlet: "NY Times", url: "https://www.nytimes.com/2025/04/17/nyregion/columbia-protest-khalil-mahdawi.html" },
    ],
  },
];

const m = (name, logo, fallback, extra = {}) => ({ name, logo, fallback, ...extra });
export const members = [
  m("NYC Student Union", "nycstudentunion.jpg", "NYC\nStudent Union"),
  m("PSA (NJIT AAUP)", "01psa-njit.png", "PSA\n(NJIT AAUP)"),
  m("AAUP St. John's", "02aaup-st-johns.jpeg", "AAUP\nSt. John's"),
  m("PSC CUNY", "03PSC-CUNY.png", "PSC\nCUNY"),
  m("AAUP The New School", "04aaup_tns.webp", "AAUP\nThe New School"),
  m("SVA Faculty United", "05SVA-fac.png", "SVA\nFaculty United"),
  m("SWC UAW Local 2710", "06swc-2710.jpg", "SWC\nUAW Local 2710"),
  m("AAUP NYU", "07nyu-aaup.png", "AAUP\nNYU"),
  m("Columbia AAUP", "08columbia-aaup.png", "Columbia\nAAUP"),
  m("Academic Student Workers", "09tns-academic.png", "Academic\nStudent Workers"),
  m("UAW 7902", "010uaw-7902.jpg", "UAW\n7902"),
  m("GSOC UAW", "GSOC-UAW.png", "GSOC\nUAW"),
  m("NYU Adjuncts ACT-UAW 7902", "012act-uaw 7902.webp", "NYU Adjuncts\nACT-UAW 7902"),
  m("Contract Faculty United CFU UAW", "013Contract Faculty CFU UAW.png", "Contract Faculty\nCFU UAW"),
  m("Rutgers AAUP-AFT", "RUAAUP.png", "Rutgers\nAAUP-AFT"),
  m("Hofstra AAUP", "hofstra-aaup.png", "Hofstra\nAAUP"),
  m("NYIT AAUP", "nyit-aaup.png", "NYIT\nAAUP"),
  m("Barnard AAUP", "barnard-aaup.png", "Barnard\nAAUP"),
  m("CFCU UAW", "CFCU-Logo-Wheel.png", "CFCU\nUAW"),
  m("Fordham AAUP", "fordham-aaup.png", "Fordham\nAAUP"),
  m("NYU Researchers United", "nyuru-uaw.png", "NYU Researchers\nUnited"),
  m("Rutgers Adjunct Faculty Union", "rutgers-adjunct.png", "Rutgers\nAdjunct Faculty", { dark: true }),
  m("New York Progressive Action Network", "NYPANLogo.png", "New York\nProgressive\nAction Network"),
  m("NYC-Westchester AAUP Regional Council", "", "NYC-Westchester\nAAUP\nRegional Council"),
];

export const partners = [
  { name: "Higher Ed Labor United", panel: "blue", logo: "helu.png", url: "https://higheredlaborunited.org/",
    description: "A national coalition of higher education workers uniting to transform the sector and build a movement for the common good across all institutions." },
  { name: "Day of Action for Higher Ed", panel: "red", logo: "coalition-for-higher-action.webp", url: "https://www.dayofactionforhighered.org/",
    description: "A national movement organizing coordinated strikes, teach-ins, and direct actions to combat austerity measures and defend higher education as an accessible public good." },
  { name: "Labor for Higher Ed", panel: "green", logo: "lfhe.png", url: "https://www.labor4highered.org/",
    description: "A unified coalition bringing together higher education workers to build massive labor power, fight for fair contracts, and ensure robust academic freedom for all." },
  { name: "AAUP", panel: "white", logo: "AAUP_logo.png", url: "https://www.aaup.org/",
    description: "The American Association of University Professors helps shape American higher education by ensuring academic freedom, establishing shared governance, and promoting economic security for all academic professionals." },
];
