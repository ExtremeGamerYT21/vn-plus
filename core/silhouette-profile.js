const profiles = Object.freeze({
    man: { label: 'man', defaultScale: 1 }, woman: { label: 'woman', defaultScale: .95 },
    boy: { label: 'boy', defaultScale: .6 }, girl: { label: 'girl', defaultScale: .5 },
    neutral: { label: 'person', defaultScale: 1 }, child: { label: 'child', defaultScale: .55 },
});
const male = new Set('man men gentleman gentlemen wizard wizards father dad daddy mister mr sir boyfriend'.split(' '));
const female = new Set('woman women lady ladies witch witches mother mum mom mummy mommy madam mrs miss ms girlfriend'.split(' '));
const boys = new Set('boy boys schoolboy schoolboys lad lads'.split(' '));
const girls = new Set('girl girls schoolgirl schoolgirls lass lasses'.split(' '));
const adults = new Set('man men woman women'.split(' '));
const children = new Set('child children kid kids little young juvenile'.split(' '));
const words = value => String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2').normalize('NFKC').toLowerCase().match(/[\p{L}]+/gu) || [];
const includes = (tokens, group) => tokens.some(token => group.has(token));

/** Explicit metadata wins; only descriptive words are inferred, never a proper name's gender. */
export function silhouetteProfile(name, properties = {}) {
    const configured = typeof properties.silhouette === 'string' ? properties.silhouette : properties.silhouette?.type;
    let type = String(configured || '').toLowerCase().trim(), source = 'property';
    if (!Object.hasOwn(profiles, type)) {
        const aliases = Array.isArray(properties.aliases) ? properties.aliases : [properties.aliases];
        const tokens = words([name, properties.displayName, properties.name, ...aliases].filter(Boolean).join(' '));
        const boy = includes(tokens, boys), girl = includes(tokens, girls);
        const gender = String(properties.gender || properties.sex || '').toLowerCase().trim();
        const specified = ['male', 'man', 'boy', 'masculine'].includes(gender) ? 'male'
            : ['female', 'woman', 'girl', 'feminine'].includes(gender) ? 'female'
            : ['neutral', 'nonbinary', 'non-binary', 'non_binary', 'other'].includes(gender) ? 'neutral' : null;
        const named = boy && girl ? 'neutral' : boy !== girl ? (boy ? 'male' : 'female') : includes(tokens, male) !== includes(tokens, female)
            ? (includes(tokens, male) ? 'male' : 'female') : 'neutral';
        const age = properties.age !== null && properties.age !== undefined && properties.age !== '' ? Number(properties.age) : NaN;
        const ageGroup = String(properties.ageGroup || '').toLowerCase().trim();
        const child = ['child', 'kid', 'minor', 'teen', 'teenager'].includes(ageGroup) ? true : ['adult', 'elder', 'elderly'].includes(ageGroup) ? false
            : Number.isFinite(age) && age >= 0 ? age < 18 : boy || girl || ['boy', 'girl'].includes(gender) || (!includes(tokens, adults) && includes(tokens, children));
        const effective = specified || named;
        type = effective === 'male' ? (child ? 'boy' : 'man') : effective === 'female' ? (child ? 'girl' : 'woman') : child ? 'child' : 'neutral';
        source = specified || Number.isFinite(age) || ageGroup ? 'property' : type === 'neutral' ? 'neutral' : 'name';
    }
    const scale = Number(properties.bustScale);
    return { type, ...profiles[type], scale: Number.isFinite(scale) && scale > 0 ? scale : profiles[type].defaultScale, source };
}
