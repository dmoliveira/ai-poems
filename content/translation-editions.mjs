// Each translation is separately identified and sourced; originals remain in
// their imported edition files. Text follows the cited 1919 anthology.
const sturm = (title, text, page) => ({
  language: 'English', title, text,
  translator: 'F. P. Sturm · 1919 anthology',
  source: `https://www.gutenberg.org/files/47032/47032-h/47032-h.htm#Page_${page}`,
  rights: 'Published in a 1919 New York anthology; public domain in the United States. Check local law before reuse.',
});

export const editionTranslations = {
  'baudelaire-la-muse-venale': [sturm('The Venal Muse', `Muse of my heart, lover of palaces,
When January comes with wind and sleet,
During the snowy eve's long wearinesses,
Will there be fire to warm thy violet feet?

Wilt thou reanimate thy marble shoulders
In the moon-beams that through the window fly?
Or when thy purse dries up, thy palace moulders,
Reap the far star-gold of the vaulted sky?

For thou, to keep thy body to thy soul,
Must swing a censer, wear a holy stole,
And chaunt Te Deums with unbelief between.

Or, like a starving mountebank, expose
Thy beauty and thy tear-drowned smile to those
Who wait thy jests to drive away thy spleen.`, 143)],
  'baudelaire-la-vie-anterieure': [sturm('A Former Life', `Long since, I lived beneath vast porticoes,
By many ocean-sunsets tinged and fired,
Where mighty pillars, in majestic rows,
Seemed like basaltic caves when day expired.

The rolling surge that mirrored all the skies
Mingled its music, turbulent and rich,
Solemn and mystic, with the colours which
The setting sun reflected in my eyes.

And there I lived amid voluptuous calms,
In splendours of blue sky and wandering wave,
Tended by many a naked, perfumed slave,

Who fanned my languid brow with waving palms.
They were my slaves—the only care they had
To know what secret grief had made me sad.`, 147)],
  'baudelaire-don-juan-aux-enfers': [sturm('Don Juan in Hades', `When Juan sought the subterranean flood,
And paid his obolus on the Stygian shore,
Charon, the proud and sombre beggar, stood
With one strong, vengeful hand on either oar.

With open robes and bodies agonised,
Lost women writhed beneath that darkling sky;
There were sounds as of victims sacrificed:
Behind him all the dark was one long cry.

And Sganarelle, with laughter, claimed his pledge;
Don Luis, with trembling finger in the air,
Showed to the souls who wandered in the sedge
The evil son who scorned his hoary hair.

Shivering with woe, chaste Elvira the while,
Near him untrue to all but her till now,
Seemed to beseech him for one farewell smile
Lit with the sweetness of the first soft vow.

And clad in armour, a tall man of stone
Held firm the helm, and clove the gloomy flood;
But, staring at the vessel's track alone,
Bent on his sword the unmoved hero stood.`, 147)],
  'baudelaire-remords-posthume': [sturm('The Remorse of the Dead', `O shadowy Beauty mine, when thou shalt sleep
In the deep heart of a black marble tomb;
When thou for mansion and for bower shalt keep
Only one rainy cave of hollow gloom;

And when the stone upon thy trembling breast,
And on thy straight sweet body's supple grace,
Crushes thy will and keeps thy heart at rest,
And holds those feet from their adventurous race;

Then the deep grave, who shares my reverie,
(For the deep grave is aye the poet's friend)
During long nights when sleep is far from thee,

Shall whisper: "Ah, thou didst not comprehend
The dead wept thus, thou woman frail and weak"—
And like remorse the worm shall gnaw thy cheek.`, 152)],
};
