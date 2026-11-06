const chineseSource = 'https://zh.wikisource.org/wiki/%E9%9D%9C%E5%A4%9C%E6%80%9D';
const aid = (language, title, text) => ({
  language, title, text,
  translator: 'Verso reading aid · AI-assisted, not yet independently reviewed',
  source: chineseSource,
  rights: 'A newly generated reading aid based on the cited original; not a historical or independently reviewed translation.',
});

export const curated = [
  {
    id: 'quiet-night-thought-li-bai', title: '靜夜思', displayTitle: 'Quiet Night Thought',
    author: 'Li Bai', authorId: 'li-bai', authorYears: '701–762', country: 'China',
    language: 'Chinese', lang: 'zh-Hant', direction: 'ltr', year: null, yearLabel: 'Tang dynasty · exact year unknown',
    era: 'Tang dynasty', form: 'Jueju', collection: 'Three Hundred Tang Poems', themes: ['Nature', 'Home', 'Quiet'], mood: 'moon',
    context: 'Moonlight becomes a bridge between the place where the speaker rests and the home they remember. This version follows Three Hundred Tang Poems; earlier textual variants differ.',
    sourceTitle: 'Wikisource · Three Hundred Tang Poems version', source: chineseSource,
    rights: 'Historical original; public domain in the United States. Check local law before reuse.',
    text: '牀前明月光，\n疑是地上霜。\n舉頭望明月，\n低頭思故鄉。',
    translations: [
      aid('English', 'Quiet Night Thought', 'Bright moonlight before my bed;\nI wonder if it is frost upon the ground.\nI lift my head and look at the bright moon;\nI lower it and think of home.'),
      aid('Spanish', 'Pensamiento en una noche serena', 'Ante mi cama brilla la luna;\nme pregunto si es escarcha en el suelo.\nAlzo la cabeza y miro la luna;\nla bajo y pienso en mi hogar.'),
      aid('Portuguese', 'Pensamento numa noite serena', 'Diante da cama brilha a luz da lua;\npergunto-me se é geada no chão.\nErgo a cabeça e olho a lua;\nbaixo-a e penso em meu lar.'),
      aid('French', 'Pensée par une nuit calme', 'Devant mon lit brille le clair de lune ;\nje me demande si c’est du givre sur le sol.\nJe lève la tête et regarde la lune ;\nje la baisse et pense à mon pays natal.'),
      aid('Italian', 'Pensiero in una notte quieta', 'Davanti al letto brilla la luna;\nmi chiedo se sia brina sul terreno.\nAlzo il capo e guardo la luna;\nlo chino e penso alla mia terra.'),
      aid('Japanese', '静かな夜の思い', '寝床の前に月の光。\n地面の霜かと見まがう。\n頭を上げて明るい月を見て、\n頭を垂れて故郷を思う。'),
      aid('Arabic', 'تأمل في ليلة هادئة', 'أمام فراشي يضيء نور القمر،\nفأتساءل: أهو صقيع على الأرض؟\nأرفع رأسي وأنظر إلى القمر المضيء،\nوأخفضه متذكّرًا موطني.'),
    ],
  },
  {
    id: 'old-pond-basho', title: '古池や', displayTitle: 'The Old Pond', author: 'Matsuo Bashō', authorId: 'matsuo-basho', authorYears: '1644–1694', country: 'Japan', language: 'Japanese', lang: 'ja', direction: 'ltr', year: 1686, yearLabel: 'Traditionally dated 1686', era: 'Edo period', form: 'Haiku', collection: 'Bashō Haiku Collection', themes: ['Nature', 'Quiet'], mood: 'nature',
    context: 'A frog, a pond and a sound: Bashō’s famous hokku makes a small event feel like an entire world. The original appears here as one line, as in the cited 1903 collection.',
    sourceTitle: 'Wikisource · Bashō Haiku Collection (1903)', source: 'https://ja.wikisource.org/wiki/%E8%8A%AD%E8%95%89%E4%BF%B3%E5%8F%A5%E5%85%A8%E9%9B%86', rights: 'Historical original; public domain in the United States. Check local law before reuse.',
    text: '古池や蛙とびこむ水の音',
    translations: [{ language: 'English', title: 'The Old Pond', text: 'Old pond—frogs jumping in—sound of water.', translator: 'Lafcadio Hearn, 1898', source: 'https://www.gutenberg.org/files/42735/42735-h/42735-h.htm', rights: 'From Exotics and Retrospectives (1898); public domain in the United States. Check local law.' }],
  },
  {
    id: 'rosa-blanca-marti', title: 'Cultivo una rosa blanca', author: 'José Martí', authorId: 'jose-marti', authorYears: '1853–1895', country: 'Cuba', language: 'Spanish', lang: 'es', direction: 'ltr', year: 1891, yearLabel: 'Published 1891', era: 'Modernismo', form: 'Octosyllabic verse', collection: 'Versos sencillos', themes: ['Love', 'Kindness', 'Nature'], mood: 'rose',
    context: 'Poem XXXIX of Versos sencillos offers the same white rose to a friend and to someone who causes pain. Martí published the collection in 1891.',
    sourceTitle: 'Wikisource · Versos sencillos, XXXIX', source: 'https://es.wikisource.org/wiki/Versos_sencillos/XXXIX', rights: 'Historical original; public domain in the United States. Check local law before reuse.',
    text: 'Cultivo una rosa blanca\nEn julio como enero,\nPara el amigo sincero\nQue me da su mano franca.\n\nY para el cruel que me arranca\nEl corazón con que vivo,\nCardo ni ortiga cultivo;\nCultivo la rosa blanca.', translations: [],
  },
  {
    id: 'amor-e-fogo-camoes', title: 'Amor he hum fogo que arde sem se ver', displayTitle: 'Amor é fogo', author: 'Luís de Camões', authorId: 'luis-de-camoes', authorYears: 'c. 1524–1580', country: 'Portugal', language: 'Portuguese', lang: 'pt', direction: 'ltr', year: null, yearLabel: '16th century · exact year unknown', era: 'Renaissance', form: 'Sonnet', collection: 'Obras completas de Luis de Camões', themes: ['Love'], mood: 'rose',
    context: 'Camões builds a portrait of love out of contradictions: a fire unseen, a wound unfelt. This transcription retains the historical spelling of the cited edition.',
    sourceTitle: 'Wikisource · Obras completas, volume II (1843)', source: 'https://pt.wikisource.org/wiki/Amor_he_hum_fogo_que_arde_sem_se_ver', rights: 'Historical original; public domain in the United States. Check local law before reuse.',
    text: 'Amor he hum fogo que arde sem se ver;\nHe ferida que doe e não se sente;\nHe hum contentamento descontente;\nHe dor que desatina sem doer;\n\nHe hum não querer mais que bem querer;\nHe solitario andar por entre a gente;\nHe hum não contentar-se de contente;\nHe cuidar que se ganha em se perder;\n\nHe hum estar-se preso por vontade;\nHe servir a quem vence o vencedor;\nHe hum ter com quem nos mata lealdade.\n\nMas como causar póde o seu favor\nNos mortaes corações conformidade,\nSendo a si tão contrário o mesmo Amor?', translations: [],
  },
  {
    id: 'demain-des-laube-hugo', title: 'Demain, dès l’aube', author: 'Victor Hugo', authorId: 'victor-hugo', authorYears: '1802–1885', country: 'France', language: 'French', lang: 'fr', direction: 'ltr', year: 1856, yearLabel: 'Published 1856 · dated 1847', era: 'Romanticism', form: 'Lyric', collection: 'Les Contemplations', themes: ['Grief', 'Home'], mood: 'moon',
    context: 'In Les Contemplations, Hugo’s journey toward a grave belongs to a sequence shaped by mourning for his daughter Léopoldine. The poem is dated 3 September 1847 in the cited edition.',
    sourceTitle: 'Wikisource · Les Contemplations', source: 'https://fr.wikisource.org/wiki/Les_Contemplations/%C2%AB_Demain,_d%C3%A8s_l%E2%80%99aube,_%C3%A0_l%E2%80%99heure_o%C3%B9_blanchit_la_campagne_%C2%BB', rights: 'Historical original; public domain in the United States. Check local law before reuse.',
    text: 'Demain, dès l’aube, à l’heure où blanchit la campagne,\nJe partirai. Vois-tu, je sais que tu m’attends.\nJ’irai par la forêt, j’irai par la montagne.\nJe ne puis demeurer loin de toi plus longtemps.\n\nJe marcherai les yeux fixés sur mes pensées,\nSans rien voir au dehors, sans entendre aucun bruit,\nSeul, inconnu, le dos courbé, les mains croisées,\nTriste, et le jour pour moi sera comme la nuit.\n\nJe ne regarderai ni l’or du soir qui tombe,\nNi les voiles au loin descendant vers Harfleur,\nEt quand j’arriverai, je mettrai sur ta tombe\nUn bouquet de houx vert et de bruyère en fleur.', translations: [],
  },
  {
    id: 'linfinito-leopardi', title: 'L’Infinito', author: 'Giacomo Leopardi', authorId: 'giacomo-leopardi', authorYears: '1798–1837', country: 'Italy', language: 'Italian', lang: 'it', direction: 'ltr', year: 1825, yearLabel: 'Published 1825 · dated 1819', era: 'Romanticism', form: 'Idyll', collection: 'Versi del conte Giacomo Leopardi', themes: ['Nature', 'Quiet'], mood: 'nature',
    context: 'A hill and a hedge open into an imagined infinity. The poem appeared in Nuovo Ricoglitore in 1825; this transcription preserves the spelling of the 1826 Versi edition, which dates the idyll to 1819.', contextSource: 'https://academic.oup.com/dsh/article/36/Supplement_1/i23/5828480', contextSourceTitle: 'Research on the first publication of the Idilli',
    sourceTitle: 'Wikisource · Versi del conte Giacomo Leopardi (1826)', source: 'https://it.wikisource.org/wiki/Versi_del_conte_Giacomo_Leopardi/L%27Infinito', rights: 'Historical original; public domain in the United States. Check local law before reuse.',
    text: 'Sempre caro mi fu quest’ermo colle,\nE questa siepe, che da tanta parte\nDe l’ultimo orizzonte il guardo esclude.\nMa sedendo e mirando, interminato\nSpazio di là da quella, e sovrumani\nSilenzi, e profondissima quiete\nIo nel pensier mi fingo; ove per poco\nIl cor non si spaura. E come il vento\nOdo stormir tra queste piante, io quello\nInfinito silenzio a questa voce\nVo comparando: e mi sovvien l’eterno,\nE le morte stagioni, e la presente\nE viva, e ’l suon di lei. Così tra questa\nInfinità s’annega il pensier mio:\nE ’l naufragar m’è dolce in questo mare.', translations: [],
  },
  {
    id: 'let-the-days-do-as-they-will', title: 'دع الأيام تفعل ما تشاء', displayTitle: 'Let the Days Do as They Will', author: 'Al-Shāfiʿī (attributed)', authorId: 'al-shafii', authorYears: '767–820', country: 'Arabian Peninsula', language: 'Arabic', lang: 'ar', direction: 'rtl', year: null, yearLabel: 'Traditional attribution · date unknown', era: 'Abbasid era', form: 'Wisdom poetry', collection: 'Traditional verses attributed to Al-Shāfiʿī', themes: ['Hope', 'Wisdom'], mood: 'sand',
    context: 'These reflective verses are traditionally attributed to Al-Shāfiʿī. The cited Wikisource transcription does not identify a source edition; its attribution and textual history need further research.',
    sourceTitle: 'Arabic Wikisource · revision 456958 · edition not identified', source: 'https://ar.wikisource.org/w/index.php?title=%D8%AF%D8%B9_%D8%A7%D9%84%D8%A3%D9%8A%D8%A7%D9%85_%D8%AA%D9%81%D8%B9%D9%84_%D9%85%D8%A7_%D8%AA%D8%B4%D8%A7%D8%A1&oldid=456958', rights: 'Traditional text attributed to an early author; Wikisource transcription credited under CC BY-SA 4.0. Its source edition and textual history need research; check local law.',
    text: 'دَعِ الأَيَّامَ تَفْعَل مَا تَشَاءُ\nوطب نفساً إذا حكمَ القضاءُ\nوَلا تَجْزَعْ لنازلة الليالي\nفما لحوادثِ الدنيا بقاءُ\nوكنْ رجلاً على الأهوالِ جلداً\nوشيمتكَ السماحةُ والوفاءُ\nوإنْ كثرتْ عيوبكَ في البرايا\nوسَركَ أَنْ يَكُونَ لَها غِطَاءُ\nتَسَتَّرْ بِالسَّخَاء فَكُلُّ عَيْب\nيغطيه كما قيلَ السَّخاءُ\nولا تر للأعادي قط ذلا\nفإن شماتة الأعدا بلاء\nولا ترجُ السماحةَ من بخيلٍ\nفَما فِي النَّارِ لِلظْمآنِ مَاءُ\nوَرِزْقُكَ لَيْسَ يُنْقِصُهُ التَأَنِّي\nوليسَ يزيدُ في الرزقِ العناءُ\nوَلا حُزْنٌ يَدُومُ وَلا سُرورٌ\nولا بؤسٌ عليكَ ولا رخاءُ\nوَمَنْ نَزَلَتْ بِسَاحَتِهِ الْمَنَايَا\nفلا أرضٌ تقيهِ ولا سماءُ\nوأرضُ الله واسعةً ولكن\nإذا نزلَ القضا ضاقَ الفضاءُ\nدَعِ الأَيَّامَ تَغْدِرُ كُلَّ حِينٍ\nفما يغني عن الموت الدواءُ', translations: [],
  },
];
