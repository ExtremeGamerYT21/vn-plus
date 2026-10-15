// Installed SillyTavern DEFAULT_EXPRESSIONS (28, including neutral).
// Every row is an ordered lookup: canonical match first, closest fallbacks next.
// This is authored presentation policy, not a model call or an image classifier.
export const BASE_EMOTIONS = Object.freeze('admiration amusement anger annoyance approval caring confusion curiosity desire disappointment disapproval disgust embarrassment excitement fear gratitude grief joy love nervousness optimism pride realization relief remorse sadness surprise neutral'.split(' '));

const preferences = {
    admiration: 'admiration approval pride gratitude love caring optimism joy curiosity desire amusement relief realization excitement neutral surprise embarrassment nervousness confusion disappointment remorse sadness disapproval grief annoyance fear anger disgust',
    amusement: 'amusement joy excitement surprise optimism relief approval pride admiration love caring gratitude curiosity realization neutral desire embarrassment confusion nervousness annoyance disapproval disappointment remorse sadness fear grief anger disgust',
    anger: 'anger annoyance disapproval disgust disappointment nervousness fear grief sadness remorse pride surprise confusion desire realization neutral embarrassment excitement curiosity approval relief caring admiration optimism love gratitude amusement joy',
    annoyance: 'annoyance anger disgust disapproval disappointment confusion nervousness embarrassment sadness remorse surprise fear pride realization neutral grief desire curiosity relief approval excitement caring admiration optimism gratitude love amusement joy',
    approval: 'approval admiration pride gratitude caring optimism joy love relief amusement realization curiosity neutral excitement desire surprise embarrassment confusion nervousness disappointment remorse sadness disapproval grief annoyance fear anger disgust',
    caring: 'caring love gratitude admiration approval relief optimism sadness remorse grief joy pride nervousness desire neutral curiosity disappointment embarrassment realization fear amusement surprise confusion excitement disapproval annoyance anger disgust',
    confusion: 'confusion curiosity realization surprise nervousness disappointment annoyance embarrassment disapproval fear neutral remorse sadness desire relief admiration excitement optimism approval pride caring disgust anger gratitude grief amusement joy love',
    curiosity: 'curiosity confusion realization surprise admiration excitement desire neutral optimism approval nervousness amusement pride joy relief caring gratitude love embarrassment disappointment disapproval remorse sadness fear annoyance disgust anger grief',
    desire: 'desire love excitement admiration curiosity optimism joy caring pride nervousness embarrassment amusement approval gratitude relief neutral realization surprise disappointment sadness confusion remorse grief annoyance disapproval fear anger disgust',
    disappointment: 'disappointment sadness disapproval annoyance remorse grief confusion nervousness disgust anger embarrassment fear neutral realization caring surprise relief curiosity desire pride approval admiration optimism gratitude love amusement excitement joy',
    disapproval: 'disapproval annoyance disgust anger disappointment confusion pride remorse sadness nervousness embarrassment neutral fear realization grief surprise curiosity caring desire approval relief admiration optimism gratitude love amusement excitement joy',
    disgust: 'disgust disapproval anger annoyance disappointment fear confusion nervousness embarrassment sadness remorse surprise grief neutral realization pride curiosity desire relief approval caring admiration optimism gratitude love amusement excitement joy',
    embarrassment: 'embarrassment nervousness remorse confusion disappointment fear sadness surprise annoyance desire neutral caring love relief curiosity disapproval gratitude admiration pride realization grief amusement approval optimism excitement disgust anger joy',
    excitement: 'excitement joy amusement surprise optimism desire pride admiration curiosity love gratitude approval relief caring realization neutral nervousness embarrassment confusion fear annoyance disappointment disapproval remorse sadness anger grief disgust',
    fear: 'fear nervousness surprise confusion grief sadness disappointment remorse embarrassment annoyance disgust anger disapproval neutral caring realization curiosity desire relief excitement pride love gratitude admiration optimism approval amusement joy',
    gratitude: 'gratitude caring love admiration approval relief joy optimism pride amusement sadness remorse neutral excitement embarrassment realization curiosity desire surprise nervousness grief disappointment confusion disapproval fear annoyance anger disgust',
    grief: 'grief sadness remorse disappointment fear nervousness caring embarrassment confusion disapproval anger annoyance neutral disgust relief realization love surprise gratitude desire curiosity pride admiration approval optimism amusement excitement joy',
    joy: 'joy amusement excitement optimism love relief pride gratitude admiration caring approval surprise desire curiosity realization neutral embarrassment nervousness confusion disappointment remorse sadness disapproval annoyance fear grief anger disgust',
    love: 'love caring desire admiration gratitude joy approval optimism relief pride amusement excitement embarrassment nervousness neutral sadness curiosity remorse realization surprise disappointment grief confusion fear disapproval annoyance anger disgust',
    nervousness: 'nervousness fear embarrassment confusion surprise remorse disappointment sadness annoyance desire curiosity neutral grief disapproval realization excitement caring disgust anger relief love pride admiration optimism gratitude approval amusement joy',
    optimism: 'optimism joy excitement approval pride relief admiration gratitude love caring amusement desire curiosity realization neutral surprise nervousness embarrassment disappointment confusion sadness remorse disapproval fear annoyance grief anger disgust',
    pride: 'pride approval admiration optimism joy excitement gratitude relief desire love amusement caring realization curiosity neutral surprise disapproval annoyance embarrassment nervousness confusion disappointment anger remorse sadness fear grief disgust',
    realization: 'realization surprise curiosity confusion relief approval admiration neutral optimism nervousness disappointment remorse pride embarrassment excitement joy caring gratitude desire disapproval sadness annoyance fear love amusement grief anger disgust',
    relief: 'relief gratitude optimism joy caring approval love admiration amusement pride realization neutral sadness remorse nervousness excitement embarrassment curiosity surprise disappointment desire confusion fear grief disapproval annoyance anger disgust',
    remorse: 'remorse sadness disappointment embarrassment grief nervousness disapproval caring fear confusion neutral relief gratitude annoyance disgust anger realization love surprise approval desire curiosity admiration optimism pride amusement excitement joy',
    sadness: 'sadness disappointment grief remorse nervousness caring embarrassment disapproval fear confusion annoyance neutral relief disgust anger realization love gratitude surprise desire curiosity approval admiration optimism pride amusement excitement joy',
    surprise: 'surprise realization confusion curiosity excitement nervousness fear amusement admiration embarrassment joy optimism neutral desire relief pride approval disappointment gratitude love caring annoyance remorse sadness disapproval disgust anger grief',
    neutral: 'neutral relief approval realization curiosity caring optimism admiration confusion gratitude pride sadness disappointment amusement remorse joy love nervousness embarrassment disapproval surprise desire annoyance excitement grief fear anger disgust',
};
export const EMOTION_RANKINGS = Object.freeze(Object.fromEntries(Object.entries(preferences).map(([key, value]) => [key, Object.freeze(value.split(' '))])));

const adjectiveGroups = {
    admiration: 'admiring impressed awed awestruck respectful reverent adoring starstruck',
    amusement: 'amused amusedly laughing laugh laughter giggling chuckling playful joking teasing mischievous cheeky silly funny entertained humorous smugly_amused',
    anger: 'angry mad furious enraged rage raging irate livid wrathful hostile outraged resentful hateful incensed seething fuming',
    annoyance: 'annoyed irritated irritating irritable aggravated frustrated exasperated impatient bothered peeved grumpy grouchy cranky disgruntled miffed vexed',
    approval: 'approving agreeable agreeing supportive approvingly satisfied pleased content accepting convinced',
    caring: 'gentle tender kind sympathetic compassionate concerned protective comforting nurturing understanding considerate warm reassuring apologetic_smile',
    confusion: 'confused puzzled perplexed bewildered baffled uncertain unsure lost dubious skeptical sceptical doubtful disoriented conflicted dazed',
    curiosity: 'curious inquisitive interested questioning quizzical attentive intrigued investigating thoughtful pensive pondering contemplative',
    desire: 'desirous wanting longing yearning lustful lust lusty horny aroused seductive sensual flirty flirtatious tempting hungry eager covetous jealous envious',
    disappointment: 'disappointed let_down disillusioned discouraged disheartened dissatisfied crestfallen deflated defeated dejected unhappy',
    disapproval: 'disapproving critical judging judgmental judgemental disdainful contemptuous unimpressed stern scolding reproachful dismissive sarcastic cynical offended',
    disgust: 'disgusted revolted repulsed nauseated nauseous sickened grossed_out appalled loathing distasteful',
    embarrassment: 'embarrassed shy flustered blushing bashful self_conscious sheepish mortified humiliated awkward bashfully',
    excitement: 'excited enthusiastic thrilled ecstatic elated exhilarated energetic hyped pumped animated exuberant overjoyed delighted',
    fear: 'scared afraid fearful frightened terrified terror horrified panicked panicky alarmed petrified spooked startled_scare distressed',
    gratitude: 'grateful thankful appreciative indebted touched moved',
    grief: 'grieving bereaved heartbroken devastated distraught inconsolable mourning anguished desolate',
    joy: 'happy joyful joyous cheerful cheery smiling smile glad merry gleeful blissful beaming radiant lighthearted delighted_smile',
    love: 'loving affectionate romantic fond enamored enamoured lovestruck infatuated devoted intimate lovesick',
    nervousness: 'nervous anxious worried uneasy tense apprehensive stressed restless jittery hesitant timid insecure unsettled agitated',
    optimism: 'optimistic hopeful encouraged confident positive upbeat determined resolute expectant reassured',
    pride: 'proud triumphant smug boastful haughty arrogant cocky self_satisfied superior dignified accomplished victorious',
    realization: 'realizing understanding enlightened knowing recognizing recognising insightful epiphany realization_dawns',
    relief: 'relieved relaxed calm peaceful serene soothed untroubled comfortable reassured_relief at_ease',
    remorse: 'remorseful regret regretful guilty apologetic sorry repentant ashamed contrite rueful self_reproachful',
    sadness: 'sad depressed sorrowful sorrow miserable gloomy melancholic melancholy despondent forlorn downcast wistful lonely crying weeping sobbing tearful upset hurt disappointed_sad',
    surprise: 'surprised shocked startled astonished astounded amazed stunned taken_aback incredulous speechless flabbergasted',
    neutral: 'default normal indifferent impassive expressionless blank composed serious stoic bored boring tired sleepy exhausted drowsy fatigued weary deadpan flat reserved nonchalant casual',
};

export const emotionKey = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/[\s-]+/g, '_');
export const EMOTION_ADJECTIVES = Object.freeze(Object.fromEntries(BASE_EMOTIONS.flatMap(base => [base, ...adjectiveGroups[base].split(' ')].map(word => [word, base]))));
export const EMOTION_ROUTES = Object.freeze(Object.fromEntries(Object.entries(EMOTION_ADJECTIVES).map(([tag, base]) => [tag, EMOTION_RANKINGS[base]])));
export function emotionProfile(value) {
    const key = emotionKey(value);
    if (Object.hasOwn(EMOTION_ADJECTIVES, key)) return EMOTION_ADJECTIVES[key];
    // Only presentation modifiers are removable; negated/compound emotions are not guessed.
    const plain = key.replace(/^(?:(?:very|slightly|really|extremely|deeply|quite|a_bit|somewhat)_)+/, '');
    return Object.hasOwn(EMOTION_ADJECTIVES, plain) ? EMOTION_ADJECTIVES[plain] : null;
}
export function emotionRanking(value) {
    const key = emotionKey(value); if (Object.hasOwn(EMOTION_ROUTES, key)) return EMOTION_ROUTES[key];
    const profile = emotionProfile(key); return profile ? EMOTION_RANKINGS[profile] : [];
}
export function spriteEmotionProfile(value) {
    const whole = emotionProfile(value); if (whole) return whole;
    const words = emotionKey(value).split(/[_\s.-]+/).map(emotionProfile).filter(Boolean);
    return words.length && new Set(words).size === 1 ? words[0] : null;
}

/** Stable scores over available names. A missing higher-ranked sprite cannot win. */
export function rankEmotions(requested, available) {
    const key = emotionKey(requested), ranking = emotionRanking(key);
    return [...new Set(available)].flatMap(name => {
        if (/blink/i.test(name)) return [];
        const exact = emotionKey(name) === key, profile = spriteEmotionProfile(name), rank = ranking.indexOf(profile);
        if (!exact && rank < 0) return [];
        return [{ name, profile, rank: exact ? 0 : rank + 1, exact }];
    }).sort((a, b) => Number(b.exact) - Number(a.exact) || a.rank - b.rank
        || Number(emotionKey(b.name) === b.profile) - Number(emotionKey(a.name) === a.profile)
        || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
