"""Dutch irregular (strong) verbs and their principal parts.

Each row is (infinitive, past singular, past plural, past participle,
auxiliary, meaning). Dutch distinguishes the singular and plural past of a
strong verb — ik brak / wij braken — so both are stored; drilling only one
leaves the other unlearned.

The auxiliary matters as much as the participle: "ik heb gelopen" and "ik ben
gelopen" are both correct but mean different things, and getting hebben/zijn
wrong is one of the most audible mistakes a learner makes. Verbs that take
either are marked "hebben/zijn".
"""

# (infinitive, past_sg, past_pl, participle, auxiliary, meaning)
IRREGULAR_VERBS = [
    # ── the essential handful ────────────────────────────────────────────
    ("zijn", "was", "waren", "geweest", "zijn", "to be"),
    ("hebben", "had", "hadden", "gehad", "hebben", "to have"),
    ("worden", "werd", "werden", "geworden", "zijn", "to become"),
    ("doen", "deed", "deden", "gedaan", "hebben", "to do"),
    ("gaan", "ging", "gingen", "gegaan", "zijn", "to go"),
    ("komen", "kwam", "kwamen", "gekomen", "zijn", "to come"),
    ("staan", "stond", "stonden", "gestaan", "hebben", "to stand"),
    ("zien", "zag", "zagen", "gezien", "hebben", "to see"),
    ("slaan", "sloeg", "sloegen", "geslagen", "hebben", "to hit"),

    # ── modal and near-modal verbs ───────────────────────────────────────
    ("kunnen", "kon", "konden", "gekund", "hebben", "to be able to"),
    ("moeten", "moest", "moesten", "gemoeten", "hebben", "to have to"),
    ("mogen", "mocht", "mochten", "gemogen", "hebben", "to be allowed to"),
    ("willen", "wilde", "wilden", "gewild", "hebben", "to want"),
    ("zullen", "zou", "zouden", "—", "hebben", "shall / will"),
    ("weten", "wist", "wisten", "geweten", "hebben", "to know (a fact)"),

    # ── the -acht / -ocht group ──────────────────────────────────────────
    ("brengen", "bracht", "brachten", "gebracht", "hebben", "to bring"),
    ("denken", "dacht", "dachten", "gedacht", "hebben", "to think"),
    ("kopen", "kocht", "kochten", "gekocht", "hebben", "to buy"),
    ("zoeken", "zocht", "zochten", "gezocht", "hebben", "to search"),
    ("verkopen", "verkocht", "verkochten", "verkocht", "hebben", "to sell"),
    ("zeggen", "zei", "zeiden", "gezegd", "hebben", "to say"),

    # ── ij → ee → e ──────────────────────────────────────────────────────
    ("blijven", "bleef", "bleven", "gebleven", "zijn", "to stay"),
    ("kijken", "keek", "keken", "gekeken", "hebben", "to look"),
    ("schrijven", "schreef", "schreven", "geschreven", "hebben", "to write"),
    ("rijden", "reed", "reden", "gereden", "hebben/zijn", "to drive / ride"),
    ("snijden", "sneed", "sneden", "gesneden", "hebben", "to cut"),
    ("bijten", "beet", "beten", "gebeten", "hebben", "to bite"),
    ("krijgen", "kreeg", "kregen", "gekregen", "hebben", "to get / receive"),
    ("stijgen", "steeg", "stegen", "gestegen", "zijn", "to rise"),
    ("zwijgen", "zweeg", "zwegen", "gezwegen", "hebben", "to keep silent"),
    ("wijzen", "wees", "wezen", "gewezen", "hebben", "to point"),
    ("verdwijnen", "verdween", "verdwenen", "verdwenen", "zijn", "to disappear"),
    ("schijnen", "scheen", "schenen", "geschenen", "hebben", "to shine / seem"),
    ("lijken", "leek", "leken", "geleken", "hebben", "to seem"),
    ("blijken", "bleek", "bleken", "gebleken", "zijn", "to turn out"),
    ("glijden", "gleed", "gleden", "gegleden", "hebben/zijn", "to slide"),
    ("grijpen", "greep", "grepen", "gegrepen", "hebben", "to grab"),
    ("knijpen", "kneep", "knepen", "geknepen", "hebben", "to pinch"),
    ("strijden", "streed", "streden", "gestreden", "hebben", "to fight / struggle"),
    ("vermijden", "vermeed", "vermeden", "vermeden", "hebben", "to avoid"),
    ("prijzen", "prees", "prezen", "geprezen", "hebben", "to praise"),
    ("rijzen", "rees", "rezen", "gerezen", "zijn", "to rise"),
    ("wijken", "week", "weken", "geweken", "zijn", "to yield / give way"),
    ("begrijpen", "begreep", "begrepen", "begrepen", "hebben", "to understand"),
    ("bewijzen", "bewees", "bewezen", "bewezen", "hebben", "to prove"),
    ("overlijden", "overleed", "overleden", "overleden", "zijn", "to pass away"),

    # ── ie / ui → oo → o ─────────────────────────────────────────────────
    ("bieden", "bood", "boden", "geboden", "hebben", "to offer"),
    ("kiezen", "koos", "kozen", "gekozen", "hebben", "to choose"),
    ("verliezen", "verloor", "verloren", "verloren", "hebben", "to lose"),
    ("vliegen", "vloog", "vlogen", "gevlogen", "hebben/zijn", "to fly"),
    ("vriezen", "vroor", "vroren", "gevroren", "hebben", "to freeze"),
    ("genieten", "genoot", "genoten", "genoten", "hebben", "to enjoy"),
    ("gieten", "goot", "goten", "gegoten", "hebben", "to pour"),
    ("schieten", "schoot", "schoten", "geschoten", "hebben", "to shoot"),
    ("sluiten", "sloot", "sloten", "gesloten", "hebben", "to close"),
    ("besluiten", "besloot", "besloten", "besloten", "hebben", "to decide"),
    ("ruiken", "rook", "roken", "geroken", "hebben", "to smell"),
    ("buigen", "boog", "bogen", "gebogen", "hebben", "to bend"),
    ("duiken", "dook", "doken", "gedoken", "hebben/zijn", "to dive"),
    ("zuigen", "zoog", "zogen", "gezogen", "hebben", "to suck"),
    ("bedriegen", "bedroog", "bedrogen", "bedrogen", "hebben", "to deceive"),
    ("verbieden", "verbood", "verboden", "verboden", "hebben", "to forbid"),
    ("schuiven", "schoof", "schoven", "geschoven", "hebben", "to shove / slide"),
    ("spuiten", "spoot", "spoten", "gespoten", "hebben", "to spray"),
    ("vloeien", "vloeide", "vloeiden", "gevloeid", "hebben", "to flow"),

    # ── i → o → o ────────────────────────────────────────────────────────
    ("beginnen", "begon", "begonnen", "begonnen", "zijn", "to begin"),
    ("drinken", "dronk", "dronken", "gedronken", "hebben", "to drink"),
    ("vinden", "vond", "vonden", "gevonden", "hebben", "to find"),
    ("binden", "bond", "bonden", "gebonden", "hebben", "to tie"),
    ("verbinden", "verbond", "verbonden", "verbonden", "hebben", "to connect"),
    ("zingen", "zong", "zongen", "gezongen", "hebben", "to sing"),
    ("springen", "sprong", "sprongen", "gesprongen", "hebben/zijn", "to jump"),
    ("zwemmen", "zwom", "zwommen", "gezwommen", "hebben/zijn", "to swim"),
    ("winnen", "won", "wonnen", "gewonnen", "hebben", "to win"),
    ("zinken", "zonk", "zonken", "gezonken", "zijn", "to sink"),
    ("dwingen", "dwong", "dwongen", "gedwongen", "hebben", "to force"),
    ("klinken", "klonk", "klonken", "geklonken", "hebben", "to sound"),
    ("krimpen", "kromp", "krompen", "gekrompen", "zijn", "to shrink"),
    ("schrikken", "schrok", "schrokken", "geschrokken", "zijn", "to be startled"),
    ("stinken", "stonk", "stonken", "gestonken", "hebben", "to stink"),
    ("trekken", "trok", "trokken", "getrokken", "hebben/zijn", "to pull"),
    ("vechten", "vocht", "vochten", "gevochten", "hebben", "to fight"),
    ("zenden", "zond", "zonden", "gezonden", "hebben", "to send"),
    ("schenken", "schonk", "schonken", "geschonken", "hebben", "to pour / donate"),
    ("treffen", "trof", "troffen", "getroffen", "hebben", "to strike / meet"),
    ("gelden", "gold", "golden", "gegolden", "hebben", "to apply / be valid"),
    ("schelden", "schold", "scholden", "gescholden", "hebben", "to swear at"),
    ("smelten", "smolt", "smolten", "gesmolten", "hebben/zijn", "to melt"),
    ("zwellen", "zwol", "zwollen", "gezwollen", "zijn", "to swell"),
    ("klimmen", "klom", "klommen", "geklommen", "hebben/zijn", "to climb"),
    ("vertrekken", "vertrok", "vertrokken", "vertrokken", "zijn", "to depart"),

    # ── e → a → o ────────────────────────────────────────────────────────
    ("nemen", "nam", "namen", "genomen", "hebben", "to take"),
    ("spreken", "sprak", "spraken", "gesproken", "hebben", "to speak"),
    ("breken", "brak", "braken", "gebroken", "hebben/zijn", "to break"),
    ("stelen", "stal", "stalen", "gestolen", "hebben", "to steal"),
    ("bevelen", "beval", "bevalen", "bevolen", "hebben", "to order / command"),
    ("bespreken", "besprak", "bespraken", "besproken", "hebben", "to discuss"),

    # ── e → a → e ────────────────────────────────────────────────────────
    ("geven", "gaf", "gaven", "gegeven", "hebben", "to give"),
    ("lezen", "las", "lazen", "gelezen", "hebben", "to read"),
    ("eten", "at", "aten", "gegeten", "hebben", "to eat"),
    ("meten", "mat", "maten", "gemeten", "hebben", "to measure"),
    ("vergeten", "vergat", "vergaten", "vergeten", "hebben/zijn", "to forget"),
    ("genezen", "genas", "genazen", "genezen", "hebben/zijn", "to heal"),
    ("treden", "trad", "traden", "getreden", "hebben/zijn", "to step"),
    ("liggen", "lag", "lagen", "gelegen", "hebben", "to lie (be lying)"),
    ("zitten", "zat", "zaten", "gezeten", "hebben", "to sit"),
    ("bidden", "bad", "baden", "gebeden", "hebben", "to pray"),

    # ── a → ie → a ───────────────────────────────────────────────────────
    ("slapen", "sliep", "sliepen", "geslapen", "hebben", "to sleep"),
    ("laten", "liet", "lieten", "gelaten", "hebben", "to let / leave"),
    ("vallen", "viel", "vielen", "gevallen", "zijn", "to fall"),
    ("bevallen", "beviel", "bevielen", "bevallen", "zijn", "to please / give birth"),
    ("houden", "hield", "hielden", "gehouden", "hebben", "to hold / keep"),
    ("lopen", "liep", "liepen", "gelopen", "hebben/zijn", "to walk"),
    ("roepen", "riep", "riepen", "geroepen", "hebben", "to call / shout"),
    ("hangen", "hing", "hingen", "gehangen", "hebben", "to hang"),
    ("vangen", "ving", "vingen", "gevangen", "hebben", "to catch"),
    ("blazen", "blies", "bliezen", "geblazen", "hebben", "to blow"),
    ("raden", "raadde", "raadden", "geraden", "hebben", "to guess / advise"),
    ("scheppen", "schiep", "schiepen", "geschapen", "hebben", "to create"),
    ("heffen", "hief", "hieven", "geheven", "hebben", "to raise / lift"),

    # ── a → oe → a ───────────────────────────────────────────────────────
    ("dragen", "droeg", "droegen", "gedragen", "hebben", "to carry / wear"),
    ("vragen", "vroeg", "vroegen", "gevraagd", "hebben", "to ask"),
    ("graven", "groef", "groeven", "gegraven", "hebben", "to dig"),
    ("varen", "voer", "voeren", "gevaren", "hebben/zijn", "to sail"),
    ("ervaren", "ervoer", "ervoeren", "ervaren", "hebben", "to experience"),
    ("jagen", "joeg", "joegen", "gejaagd", "hebben", "to hunt / chase"),
    ("verdragen", "verdroeg", "verdroegen", "verdragen", "hebben", "to endure"),

    # ── e → ie → o ───────────────────────────────────────────────────────
    ("helpen", "hielp", "hielpen", "geholpen", "hebben", "to help"),
    ("sterven", "stierf", "stierven", "gestorven", "zijn", "to die"),
    ("werpen", "wierp", "wierpen", "geworpen", "hebben", "to throw"),
    ("werven", "wierf", "wierven", "geworven", "hebben", "to recruit"),
    ("bederven", "bedierf", "bedierven", "bedorven", "hebben/zijn", "to spoil"),
    ("zwerven", "zwierf", "zwierven", "gezworven", "hebben", "to wander"),

    # ── e → oo → o ───────────────────────────────────────────────────────
    ("wegen", "woog", "wogen", "gewogen", "hebben", "to weigh"),
    ("bewegen", "bewoog", "bewogen", "bewogen", "hebben", "to move"),
    ("scheren", "schoor", "schoren", "geschoren", "hebben", "to shave"),
    ("zweren", "zwoer", "zwoeren", "gezworen", "hebben", "to swear (an oath)"),

    # ── weak past, strong participle ─────────────────────────────────────
    ("lachen", "lachte", "lachten", "gelachen", "hebben", "to laugh"),
    ("bakken", "bakte", "bakten", "gebakken", "hebben", "to bake / fry"),
    ("braden", "braadde", "braadden", "gebraden", "hebben", "to roast"),
    ("heten", "heette", "heetten", "geheten", "hebben", "to be called"),
    ("scheiden", "scheidde", "scheidden", "gescheiden", "hebben/zijn", "to separate"),
    ("vouwen", "vouwde", "vouwden", "gevouwen", "hebben", "to fold"),
    ("spannen", "spande", "spanden", "gespannen", "hebben", "to tighten"),
    ("wassen", "waste", "wasten", "gewassen", "hebben", "to wash"),
    ("stoten", "stootte", "stootten", "gestoten", "hebben", "to bump"),
    ("malen", "maalde", "maalden", "gemalen", "hebben", "to grind"),

    # ── staan / gaan compounds ───────────────────────────────────────────
    ("bestaan", "bestond", "bestonden", "bestaan", "hebben", "to exist"),
    ("verstaan", "verstond", "verstonden", "verstaan", "hebben", "to understand (hear)"),
    ("ontstaan", "ontstond", "ontstonden", "ontstaan", "zijn", "to arise"),
    ("opstaan", "stond op", "stonden op", "opgestaan", "zijn", "to get up"),
    ("uitgaan", "ging uit", "gingen uit", "uitgegaan", "zijn", "to go out"),
    ("meegaan", "ging mee", "gingen mee", "meegegaan", "zijn", "to come along"),
    ("aankomen", "kwam aan", "kwamen aan", "aangekomen", "zijn", "to arrive"),
    ("voorkomen", "kwam voor", "kwamen voor", "voorgekomen", "zijn", "to occur"),
    ("meenemen", "nam mee", "namen mee", "meegenomen", "hebben", "to take along"),
    ("opnemen", "nam op", "namen op", "opgenomen", "hebben", "to pick up / record"),
    ("uitgeven", "gaf uit", "gaven uit", "uitgegeven", "hebben", "to spend / publish"),
    ("toegeven", "gaf toe", "gaven toe", "toegegeven", "hebben", "to admit"),
    ("opschrijven", "schreef op", "schreven op", "opgeschreven", "hebben", "to write down"),
    ("uitzien", "zag uit", "zagen uit", "uitgezien", "hebben", "to look (appear)"),
    ("afspreken", "sprak af", "spraken af", "afgesproken", "hebben", "to arrange"),
    ("optreden", "trad op", "traden op", "opgetreden", "zijn", "to perform / act"),
    ("uitnodigen", "nodigde uit", "nodigden uit", "uitgenodigd", "hebben", "to invite"),
    # ── from the source table, previously missing ────────────────────────
    ("bergen", "borg", "borgen", "geborgen", "hebben", "to save / store"),
    ("bezoeken", "bezocht", "bezochten", "bezocht", "hebben", "to visit"),
    ("dringen", "drong", "drongen", "gedrongen", "hebben/zijn", "to push"),
    ("liegen", "loog", "logen", "gelogen", "hebben", "to lie (tell a lie)"),
    ("ontvangen", "ontving", "ontvingen", "ontvangen", "hebben", "to receive"),
    ("steken", "stak", "staken", "gestoken", "hebben", "to sting / stab"),
    ("verlaten", "verliet", "verlieten", "verlaten", "hebben", "to leave"),
]
