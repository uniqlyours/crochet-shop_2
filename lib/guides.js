// SEO gift-guide landing pages. Each guide targets a long-tail search
// ("crochet baby shower gifts", "first communion favors"...) with real copy,
// a curated product grid, and FAQ schema. Rendered server-side in server.js.

const has = (p, ...words) => words.some(w =>
  (p.name + ' ' + (p.kind || '') + ' ' + (p.category || '')).toLowerCase().includes(w));

export const GUIDES = [
  {
    slug: 'handmade-crochet-gifts',
    title: 'Handmade Crochet Gifts for Every Occasion',
    metaDesc: 'Unique handmade crochet gifts — cuddle baskets, keychains, handbags and one-of-a-kind pieces, hooked by hand in small batches. Ships from the USA.',
    h1: 'Handmade crochet gifts for every occasion',
    intro: [
      'A handmade gift says something a store-bought one can’t: someone spent hours making this, one stitch at a time. Every piece in our little studio is crocheted by hand by Undraa — no machines, no mass production, no two exactly alike.',
      'Whether you need a birthday surprise, a thank-you, or a just-because treat, here’s everything we make, from $3 keychains to one-of-a-kind handbags.'
    ],
    pick: ps => ps,
    faqs: [
      { q: 'Are these really handmade?', a: 'Yes — every single piece is crocheted by hand by Undraa in our home studio. A small basket takes 4–6 hours of work; nothing is machine-made.' },
      { q: 'How long does shipping take?', a: 'Ready-made pieces ship within a few days. Custom orders are typically finished in 2–4 weeks — you’ll get an email the moment yours ships.' },
      { q: 'Can I request a custom color or design?', a: 'Absolutely. Use the “Request something custom” form on our homepage and tell us what you’d love — we’ll reply with ideas and a quote.' }
    ]
  },
  {
    slug: 'christmas',
    title: 'Handmade Christmas Gifts & Stocking Stuffers',
    metaDesc: 'Handmade crochet Christmas gifts and stocking stuffers — cute keychains from $3, cuddle baskets and cozy one-of-a-kind presents, made by hand.',
    h1: 'Handmade Christmas gifts & stocking stuffers',
    intro: [
      'The best Christmas gifts are the ones that feel personal. Our hand-crocheted keychains make perfect stocking stuffers (from just $3), and the cuddle baskets are the kind of present that stays on a shelf for years.',
      'Everything is made in small batches, so holiday stock is limited — when a piece is gone, it’s gone until it can be hooked again.'
    ],
    pick: ps => ps.filter(p => p.price <= 25 || has(p, 'basket')),
    faqs: [
      { q: 'When should I order for Christmas?', a: 'Ready-made pieces ship within days, but small-batch stock runs out fast in December — ordering by early December is safest. Custom pieces need 2–4 weeks, so ask early.' },
      { q: 'Do you gift wrap?', a: 'Every order is wrapped with care and a hand-tied tag — it arrives ready to give.' },
      { q: 'What makes a good stocking stuffer?', a: 'Our fish, croissant and moon keychains ($3–$5) are stocking-sized, sturdy, and make everyone smile on Christmas morning.' }
    ]
  },
  {
    slug: 'first-communion-baptism',
    title: 'First Communion & Baptism Favors — Handmade Bible Keychains',
    metaDesc: 'Handmade crochet Bible keychains — meaningful First Communion favors, baptism favors and confirmation gifts. Bulk orders welcome.',
    h1: 'First Communion & baptism favors',
    intro: [
      'A tiny crocheted Bible, stitched by hand with a cross on the cover — our mini Bible keychains have become a favorite for First Communion favors, baptism keepsakes and confirmation gifts. They’re small enough for a pocket, sturdy enough for a keyring, and meaningful enough to keep for years.',
      'Choose from soft pink, lavender, cream & gold and more. Planning favors for a whole celebration? We take bulk and custom-color orders — just ask.'
    ],
    pick: ps => ps.filter(p => has(p, 'bible', 'charm')),
    faqs: [
      { q: 'Can I order these in bulk as party favors?', a: 'Yes! Bulk orders for communions, baptisms and confirmations are our favorite kind. Use the custom request form with your quantity, colors and date, and we’ll send a quote.' },
      { q: 'Can you match our celebration colors?', a: 'Usually, yes — tell us the colors and we’ll match the yarn as closely as we can.' },
      { q: 'How far in advance should I order favors?', a: 'For bulk orders, 4–6 weeks before the celebration is ideal — each Bible is crocheted by hand.' }
    ]
  },
  {
    slug: 'baby-shower',
    title: 'Crochet Baby Shower Gifts — Handmade & Adorable',
    metaDesc: 'Handmade crochet baby shower gifts — adorable animal cuddle baskets and soft keepsakes, hooked by hand with baby-safe details.',
    h1: 'Crochet baby shower gifts',
    intro: [
      'Baby showers were made for handmade gifts. Our animal cuddle baskets — a bunny, bear, fox or unicorn hugging a little basket — start as nursery storage for tiny things and grow into a keepsake the kid never lets go of.',
      'Every piece is made with tightly-stitched details and safety eyes sewn to stay. It’s the gift at the shower everyone asks about.'
    ],
    pick: ps => ps.filter(p => has(p, 'basket', 'bunny', 'bear', 'sheep', 'unicorn')),
    faqs: [
      { q: 'Are the materials baby-friendly?', a: 'We use soft acrylic and cotton yarns, and eyes are safety-backed and sewn tight. For newborns we recommend embroidered-face customs — just ask.' },
      { q: 'Can I get a specific animal or color?', a: 'Yes — if you don’t see the animal you want, request a custom. Most custom baskets take 2–4 weeks.' },
      { q: 'How do I wash a cuddle basket?', a: 'Spot-clean or gentle cold hand wash, press the water out with a towel, and dry flat in the shade.' }
    ]
  },
  {
    slug: 'valentines-day',
    title: 'Handmade Valentine’s Day Gifts — Crochet With Love',
    metaDesc: 'Handmade Valentine’s Day gifts with heart — crochet charms, pink keychains and one-of-a-kind pieces made stitch by stitch.',
    h1: 'Valentine’s Day gifts made with love',
    intro: [
      '“Made with love” isn’t a slogan here — it’s literally how these are made. For Valentine’s, think small and meaningful: a cherry charm with a red heart, a soft pink fish for their keys, or a little handbag that no one else on earth owns.',
      'Each piece ships wrapped and ready to give, with a hand-tied tag.'
    ],
    pick: ps => ps.filter(p => has(p, 'pink', 'rose', 'cherry', 'heart', 'blush', 'handbag', 'purse')),
    faqs: [
      { q: 'Will it arrive by February 14?', a: 'Ready-made pieces ship within days — order by early February to be safe. Customs need 2–4 weeks, so December–January is the time to ask.' },
      { q: 'What if they’re not a “cute keychain” person?', a: 'Look at the handbags — hand-crocheted, structured, one of a kind. Nobody else will have it.' },
      { q: 'Can you add a note to the gift?', a: 'Yes — tell us at checkout or by email and we’ll tuck a handwritten note into the wrapping.' }
    ]
  },
  {
    slug: 'mothers-day',
    title: 'Mother’s Day Handmade Gifts — Crochet Bags & Keepsakes',
    metaDesc: 'Handmade Mother’s Day gifts — one-of-a-kind crochet handbags, cuddle baskets and keepsakes she’ll actually use, made by hand.',
    h1: 'Mother’s Day gifts she’ll keep forever',
    intro: [
      'Moms can tell the difference between a gift that took five minutes and one that took five hours. Our hand-crocheted handbags — cocoa with gold shimmer, a plum tote with silk scarf handles — are five-hour gifts.',
      'On a budget? A cuddle basket for her vanity or a little coin purse says the same thing in a smaller stitch.'
    ],
    pick: ps => ps.filter(p => has(p, 'handbag', 'purse', 'basket', 'tote')),
    faqs: [
      { q: 'Are the handbags really one of a kind?', a: 'Yes — each bag is a single piece. Once it sells, that exact bag will never exist again.' },
      { q: 'How sturdy is a crochet handbag?', a: 'They’re worked in chunky recycled tee yarn with firm, dense stitches — they hold their shape and everyday essentials with ease.' },
      { q: 'Can I order a custom bag in her favorite color?', a: 'Yes — custom bags take 2–4 weeks. Send us the color and any inspiration photos.' }
    ]
  },
  {
    slug: 'gifts-under-10',
    title: 'Cute Handmade Gifts Under $10',
    metaDesc: 'Handmade gifts under $10 — crochet fish keychains from $3, croissants, moons and mini Bibles. Small prices, big smiles.',
    h1: 'Cute handmade gifts under $10',
    intro: [
      'Small budget, big smile. Every one of these is under ten dollars and still 100% hooked by hand — fish keychains in a dozen colors, a flaky-cute croissant, a sleepy crescent moon, tiny Bibles with stitched crosses.',
      'Perfect for party favors, coworkers, teachers, or topping off a bigger gift.'
    ],
    pick: ps => ps.filter(p => p.price <= 10),
    faqs: [
      { q: 'Are cheap gifts still handmade?', a: 'Same hands, same care — a fish keychain just takes fewer hours than a handbag. Nothing in the shop is machine-made.' },
      { q: 'Do you do party-favor quantities?', a: 'Yes — bulk orders welcome. Send a custom request with your quantity and date.' },
      { q: 'What’s the most popular under-$10 gift?', a: 'The fish keychains — a dozen colors, $5, and everyone smiles at a fish.' }
    ]
  },
  {
    slug: 'teacher-gifts',
    title: 'Handmade Teacher Appreciation Gifts',
    metaDesc: 'Thoughtful handmade teacher gifts — crochet keychains, coin purses and small keepsakes that beat another mug. From $3.',
    h1: 'Teacher gifts that beat another mug',
    intro: [
      'Teachers have enough mugs. A hand-crocheted keychain on their lanyard or a little coin purse in their bag is a daily reminder that someone noticed them — and it costs less than a bouquet.',
      'End-of-year and holiday classes: we can make matching sets for the whole teaching team.'
    ],
    pick: ps => ps.filter(p => p.price <= 12),
    faqs: [
      { q: 'What do teachers actually like?', a: 'Small, useful, personal: a keychain for the lanyard, a coin purse for the coffee run, a tiny Bible if faith matters to them.' },
      { q: 'Can I get a set for several teachers?', a: 'Yes — order multiples or send a custom request for a matching set in school colors.' },
      { q: 'When should I order for end of the school year?', a: 'By early May for ready-made pieces; custom sets are best requested 4+ weeks ahead.' }
    ]
  }
];
