import type { NewsCard } from './zayroviNews';

export const ZAYROVI_NEWS_GUIDES: readonly NewsCard[] = [
  {
    id: 'guide-z-lens', kind: 'notice', section: 'tools', tool: 'lens', image: '/media/publications/editorial-tech.jpg',
    title: { fr: 'Z Lens : retrouver un article à partir d’une photo', ar: 'Z Lens: لوّج على منتج من تصويرة' },
    summary: { fr: 'Partez d’une photo ou d’un lien pour chercher un article.', ar: 'ابدأ بتصويرة ولا برابط باش تلوّج على منتج.' },
    body: {
      fr: '## Commencer la recherche\nOuvrez Z Lens, prenez une photo ou choisissez-en une dans votre galerie. Cadrez de préférence l’article que vous voulez retrouver. Vous pouvez aussi coller le lien d’un produit.\n\n## Examiner les résultats\nUne ressemblance visuelle n’est pas une garantie que deux articles sont identiques. Ouvrez la fiche pour vérifier la marque, la couleur, la taille, le prix et la disponibilité avant de choisir.',
      ar: '## كيفاش تبدأ\nافتح Z Lens، صوّر المنتج ولا اختار تصويرة من الغاليري. حاول تركّز على القطعة اللي تلوّج عليها. تنجّم زادة تلصّق رابط المنتج.\n\n## ثبّت في النتائج\nالتشابه في التصويرة ما يعنيش اللي القطعتين نفسهم. افتح الفيشة وثبّت في الماركة واللون والقياس والسوم والتوفّر قبل الاختيار.',
    },
  },
  {
    id: 'guide-clean', kind: 'notice', section: 'tools', tool: 'clean', image: '',
    title: { fr: 'Clean : poser une question avant d’acheter', ar: 'Clean: اسأل قبل ما تشري' },
    summary: { fr: 'Demandez de l’aide pour comprendre un prix ou choisir un article.', ar: 'اسأل على السوم ولا اطلب معاونة في اختيار منتج.' },
    body: {
      fr: '## Quoi demander ?\nClean est l’assistant shopping de Zayrovi. Décrivez l’article que vous cherchez ou posez une question sur un produit, son prix ou le parcours d’achat.\n\n## Avant de décider\nPrécisez vos critères, par exemple votre budget, la taille ou l’usage. Pour une décision d’achat, vérifiez toujours les informations affichées dans la fiche ou le devis.',
      ar: '## على شنوة تنجّم تسأل؟\nClean هو المساعد متاع الشوبينغ في Zayrovi. اوصف القطعة اللي تلوّج عليها، ولا اسأل على منتج أو سومو أو كيفاش تكمل الشراء.\n\n## قبل ما تختار\nوضّح شنوّة يهمّك: الميزانية، القياس ولا الاستعمال. قبل الشراء ثبّت ديما في المعلومات اللي تظهر في الفيشة ولا في عرض السعر.',
    },
  },
  {
    id: 'guide-aywebs', kind: 'notice', section: 'tools', tool: 'aywebs', image: '/media/publications/editorial-style.jpg',
    title: { fr: 'AYWEBs : découvrir les boutiques partenaires', ar: 'AYWEBs: اكتشف البوتيكات الشريكة' },
    summary: { fr: 'Explorez les boutiques prises en charge et préparez une demande d’achat.', ar: 'تفرّج في البوتيكات المدعومة وحضّر طلب شراء.' },
    body: {
      fr: '## Choisir une boutique\nOuvrez AYWEBs et sélectionnez une boutique disponible. Quand un article vous plaît, choisissez la bonne variante avant de poursuivre.\n\n## Vérifier avant de commander\nRetrouvez les articles préparés dans AYWEBs ou votre panier selon l’étape. Le prix marchand, la disponibilité et les frais éventuels doivent être confirmés dans le parcours Zayrovi avant le paiement.',
      ar: '## اختار بوتيك\nافتح AYWEBs واختار بوتيك متوفّر. كي تعجبك قطعة، ثبّت في اللون والقياس قبل ما تكمّل.\n\n## ثبّت قبل الطلب\nتلقى القطع اللي حضّرتهم في AYWEBs ولا في القفّة حسب المرحلة. سوم المتجر والتوفّر والمصاريف الإضافية يلزم تتثبّت منهم في Zayrovi قبل الخلاص.',
    },
  },
  {
    id: 'guide-zayrovi', kind: 'notice', section: 'about', image: '',
    title: { fr: 'Découvrir Zayrovi : de l’inspiration à la fiche produit', ar: 'اكتشف Zayrovi: من الفكرة لفيشة المنتج' },
    summary: { fr: 'Un guide pour se repérer dans le catalogue, Social Shopping et Zayrovi News.', ar: 'دليل باش تتعرّف على الكاتالوغ وSocial Shopping وZayrovi News.' },
    body: {
      fr: '## S’inspirer\nSocial Shopping réunit des Stories, Reels et sélections. Certains contenus ont des articles liés : touchez la carte d’un article pour voir sa fiche. Les Highlights de l’accueil mettent un produit en avant dans une vidéo.\n\n## Comprendre avant d’acheter\nLa fiche présente les informations catalogue disponibles. Vérifiez les variantes, la disponibilité et les conditions affichées avant de confirmer votre commande.\n\n## Suivre les nouveautés\nZayrovi News rassemble nos annonces, les guides de nos outils et nos dossiers. Ouvrez un article pour lire l’explication complète.',
      ar: '## خذ فكرة\nفي Social Shopping تلقى Stories وReels ومختارات. بعض المحتويات مربوطة بمنتجات: اضغط على كارت المنتج باش تشوف فيشتو. وفي Highlights متاع الـHome كل فيديو يبرّز منتج.\n\n## ثبّت قبل الشراء\nالفيشة توريك معلومات الكاتالوغ المتوفّرة. ثبّت في القياس واللون والتوفّر والشروط قبل ما تأكّد الطلب.\n\n## تابع الجديد\nفي Zayrovi News تلقى أخبارنا، أدلّة أدواتنا وملفاتنا. افتح المقال باش تقرا التفسير الكامل.',
    },
  },
];
