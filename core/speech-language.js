// Small local vocabularies: grammatical evidence matters more than shared words
// such as "in", "die", "no" or "a". No network/model calls or runtime dictionary.
const VOCABULARIES = {
    en: `i me my mine we us our ours you your yours he him his she her hers it its they them their theirs the a an this that these those am is are was were be been being have has had do does did will would shall should can could may might must not no yes and or but if because as at by for from in into of on out over to under up with without who what when where why how which than then there here now just so very too also only all any some every each other another much many more most such please hello goodbye sorry thanks thank okay well come go going get got let want need know think say said see look wait stop stay good bad right wrong understand understood absolutely certainly fine sure exactly agreed enough ready listen remember tell take give keep find make don't doesn't didn't isn't aren't wasn't weren't i'm i'll i've you're we're they're can't won't wouldn't shouldn't that's it's let's` ,
    de: `ich mich mir mein meine meiner meinem meinen du dich dir dein deine deiner wir uns unser unsere ihr euch euer eure er ihn ihm sein seine sie ihnen ihr ihre es der die das den dem des ein eine einen einem einer eines ist sind bin bist seid war waren habe hast hat haben hatte werden wird werde würde kann kannst können könnt könntest muss musst müssen soll sollst sollen will willst wollen nicht nichts nie nein ja und oder aber wenn weil dass als auch also an auf aus bei bis durch für gegen hinter im in ins mit nach neben ohne über um unter von vor zu zum zur zwischen hier her dort jetzt heute morgen gestern immer schon noch nur sehr so wie was wer wen wem wo wann warum bitte danke hallo tschüss gut gute guten tag nacht geht gehen komm kommen bleiben bleib warte warten hör hören sagen sag tun tut leid machen gemacht sehen sieht weiß wissen hätte kind kinder mann frau haus hause park schule schön schnell leise wirklich doch mal denn etwas alles bereit los pass keine kein keins deine recht zurück zusammen sprechen steht steh still gerade diese dieser dieses zwei drei vier fünf nicht wahr stimmt genau lass lassen verstehst verstehe` ,
    fr: `je me moi mon ma mes tu te toi ton ta tes il elle on nous vous ils elles leur leurs le la les un une des du de au aux ce cet cette ces et ou mais donc car si que qui quoi où quand comment pourquoi ne pas plus jamais rien suis es est sommes êtes sont étais était ai as a avons avez ont avoir être faire fait fais aller vais va allons allez vont viens venez ici là maintenant aujourd'hui demain hier toujours déjà encore très aussi bien bon bonne bonjour salut merci pardon oui non s'il plaît faut peux peut pouvez veux veut voulons voir regarde attends attendez reste chez avec sans pour par dans sur sous avant après votre vos notre nos c'est j'ai d'accord` ,
    es: `yo me mi mis mío tú te ti tu tus él ella nosotros nos vosotros os ellos ellas usted ustedes su sus el la los las un una unos unas de del al a en con sin por para sobre entre y o pero porque que qué quién dónde cuándo cómo cuál si sí no nunca nada soy eres es somos sois son estoy estás está estamos están tengo tienes tiene tenemos tienen hay he has ha hemos han ser estar hacer ir voy vas va vamos van ven venga aquí allí ahora hoy mañana ayer siempre ya todavía muy también bien bueno buena buenos buenas hola gracias adiós perdón favor quiero quieres quiere queremos puedo puedes puede podemos mira espera oye escucha` ,
    pt: `eu me mim meu minha meus minhas tu te ti teu tua você vocês ele ela nós nos vós eles elas seu sua seus suas o a os as um uma uns umas de do da dos das ao aos à às em no na nos nas com sem por para pelo pela entre e ou mas porque que quem onde quando como qual se sim não nunca nada sou és é somos são estou estás está estamos estão tenho tens tem temos têm há ser estar fazer ir vou vais vai vamos vão vem venha aqui ali agora hoje amanhã ontem sempre já ainda muito também bem bom boa bons boas olá obrigado obrigada tchau adeus desculpe favor quero quer queremos posso pode podemos olha espera escuta você isto isso essa esse esta este` ,
    it: `io me mi mio mia miei mie tu te ti tuo tua lui lei noi ci voi vi loro il lo la i gli le un uno una di del della dei delle da dal a al alla ai alle in nel nella con senza per tra fra e o ma perché che chi cosa dove quando come quale se sì si no non mai niente sono sei è siamo siete erano ho hai ha abbiamo avete hanno essere avere fare fatto andare vado vai va andiamo vanno vieni venga qui qua lì là ora oggi domani ieri sempre già ancora molto anche bene buono buona buongiorno buonasera ciao grazie prego scusa per favore voglio vuoi vuole vogliamo posso puoi può possiamo guarda aspetta ascolta questo questa questi queste` ,
    nl: `ik me mij mijn jij je jou jouw hij hem zijn zij ze haar wij we ons onze jullie hun het de een dit dat deze die en of maar want omdat als niet niets nooit nee ja ben bent is zijn was waren heb hebt heeft hebben had zal zullen zou kan kunnen moet moeten wil willen kom komen ga gaan hier daar nu vandaag morgen gisteren altijd al nog heel ook goed goede hallo dank bedankt alsjeblieft tot ziens met zonder voor van naar op onder over door bij uit in om aan wat wie waar wanneer waarom hoe welke wacht kijk luister huis thuis samen graag` ,
    pl: `ja mnie mi mój moja moje ty ci ciebie twój twoja on ona ono my nas nam wy was wam oni one jego jej ich ten ta to te ci tego tej tym jest jestem jesteś jesteśmy jesteście są był była byli mam masz ma mamy macie mają nie nigdy nic tak i lub ale bo ponieważ że jeśli gdy jak co kto gdzie kiedy dlaczego czy z ze bez do od na w we za po przed pod nad przez dla tutaj tam teraz dziś dzisiaj jutro wczoraj zawsze już jeszcze bardzo też dobrze dobry dobra dzień cześć dziękuję proszę przepraszam chodź idź chodzimy poczekaj patrz słuchaj chcę chcesz chce możemy mogę możesz` ,
    ru: `я меня мне мой моя ты тебя тебе твой он она мы нас вы вас они их это этот эта эти и или но если что кто где когда как почему не нет да был была были есть будем будет здесь там сейчас сегодня завтра вчера уже ещё очень тоже хорошо привет спасибо пожалуйста прости идём иди идти домой стой подожди посмотри слушай хочу хочешь хочет могу можешь может нужно надо` ,
    uk: `я мене мені мій моя ти тебе тобі твій він вона ми нас ви вас вони їх це цей ця ці і або але якщо що хто де коли як чому ні не так був була були є тут там зараз сьогодні завтра вчора вже ще дуже теж добре привіт дякую будь ласка пробач ходімо йди стій зачекай дивись слухай хочу хочеш хоче можу можеш може потрібно треба` ,
};
const LABELS = { en: 'English', de: 'German', fr: 'French', es: 'Spanish', pt: 'Portuguese', it: 'Italian', nl: 'Dutch', pl: 'Polish', ru: 'Russian', uk: 'Ukrainian', ja: 'Japanese', zh: 'Chinese', ko: 'Korean', ar: 'Arabic', el: 'Greek', hi: 'Hindi', he: 'Hebrew', th: 'Thai', 'und-Cyrl': 'Cyrillic (language uncertain)' };
const lexicon = new Map();
for (const [language, vocabulary] of Object.entries(VOCABULARIES)) for (const word of new Set(vocabulary.split(/\s+/))) {
    if (!lexicon.has(word)) lexicon.set(word, []);
    lexicon.get(word).push(language);
}
const GREETINGS = new Map(Object.entries({ danke: 'de', hallo: 'de', tschüss: 'de', nein: 'de', bonjour: 'fr', merci: 'fr', hola: 'es', gracias: 'es', adiós: 'es', obrigado: 'pt', obrigada: 'pt', olá: 'pt', grazie: 'it', buongiorno: 'it', bedankt: 'nl', dziękuję: 'pl', cześć: 'pl', привет: 'ru', спасибо: 'ru', привіт: 'uk', дякую: 'uk' }));
const SCRIPTS = [['ja', /[\p{Script=Hiragana}\p{Script=Katakana}]/u], ['ko', /\p{Script=Hangul}/u], ['zh', /\p{Script=Han}/u], ['ar', /\p{Script=Arabic}/u], ['el', /\p{Script=Greek}/u], ['hi', /\p{Script=Devanagari}/u], ['he', /\p{Script=Hebrew}/u], ['th', /\p{Script=Thai}/u]];
export function speechLanguageCode(value) {
    if (typeof value !== 'string' || !/^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i.test(value.trim())) return null;
    const code = value.trim().toLowerCase().split(/[-_]/)[0];
    return ['und', 'auto'].includes(code) ? null : code;
}
export const speechLanguageName = language => LABELS[language] || language;

/** Null means ambiguous, not English. Resolve it from a property/nearby speech. */
export function detectSpeechLanguage(text) {
    const clean = String(text || '').normalize('NFKC').toLowerCase().replace(/<\|speaker:\d+\|>|\[[^\]\r\n]*\]|<[^>]*>/g, ' ');
    const words = clean.match(/\p{L}+(?:['’]\p{L}+)*/gu) || [];
    const scores = new Map(), hits = new Map(), unique = new Map();
    for (const word of new Set(words.map(word => word.replaceAll('’', "'")))) {
        const languages = lexicon.get(word); if (!languages) continue;
        for (const language of languages) {
            scores.set(language, (scores.get(language) || 0) + (languages.length === 1 ? 2.5 : languages.length === 2 ? 1 : .35));
            hits.set(language, (hits.get(language) || 0) + 1);
            if (languages.length === 1) unique.set(language, (unique.get(language) || 0) + 1);
        }
    }
    // Recognizable English wording makes this a code-switch rather than a wholly
    // foreign utterance. Shared tokens alone cannot trigger this veto.
    if (unique.get('en')) return 'en';
    const letters = [...clean].filter(char => /\p{L}/u.test(char));
    for (const [language, script] of SCRIPTS) {
        const count = letters.filter(char => script.test(char)).length;
        if (count && (count / letters.length >= .4 || language === 'ja' && count >= 2)) return language;
    }
    const ranked = [...scores].sort((a, b) => b[1] - a[1]);
    const [language, score] = ranked[0] || [];
    if (score >= 2.8 && hits.get(language) >= 2 && score - (ranked[1]?.[1] || 0) >= 2) return language;
    const greetings = new Set(words.map(word => GREETINGS.get(word)).filter(Boolean));
    if (words.length <= 4 && greetings.size === 1) return [...greetings][0];
    // Unknown Cyrillic stays separate from English; the property can disambiguate
    // Russian/Ukrainian and other languages using the same script.
    if (letters.length && letters.filter(char => /\p{Script=Cyrillic}/u.test(char)).length / letters.length >= .6) return 'und-Cyrl';
    return null;
}
