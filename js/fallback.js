/* =========================================================
   PlanWise AI — Built-in Smart Planner (offline fallback)
   Produces a plan in the SAME JSON schema the GenAI providers
   return, so the UI never cares where a plan came from.
   ========================================================= */
(function (global) {
  'use strict';

  const TEMPLATES = {
    wedding: {
      budget: [
        ['Venue & rentals', 0.30, 'Ceremony + reception space, tables, chairs, linens'],
        ['Catering & bar', 0.24, 'Per-guest meal, service staff, beverages'],
        ['Photography & video', 0.11, 'Full-day coverage, edited gallery'],
        ['Attire & beauty', 0.08, 'Outfits, alterations, hair & makeup'],
        ['Flowers & décor', 0.08, 'Bouquets, centrepieces, arch, lighting'],
        ['Music & entertainment', 0.06, 'DJ or band, ceremony musician'],
        ['Stationery & favors', 0.03, 'Invites, signage, guest favors'],
        ['Cake & desserts', 0.02, 'Wedding cake / dessert table'],
        ['Transport & lodging', 0.03, 'Guest shuttles, getaway car'],
        ['Contingency', 0.05, 'Buffer for overruns and tips']
      ],
      timeline: [
        { phase: 'Vision & foundations', daysBefore: 365, tasks: ['Set the overall budget and who contributes', 'Draft the guest list and estimate headcount', 'Choose 2–3 candidate dates', 'Agree on style, formality and must-haves', 'Create a shared planning folder and tracker'] },
        { phase: 'Lock the big three', daysBefore: 300, tasks: ['Tour and book the ceremony & reception venue', 'Book photographer / videographer', 'Book caterer or confirm venue catering', 'Hire a planner or day-of coordinator (optional)', 'Send save-the-dates'] },
        { phase: 'Build the experience', daysBefore: 210, tasks: ['Book DJ / band and ceremony musician', 'Choose florist and sketch décor concept', 'Order attire and schedule fittings', 'Reserve hotel room blocks and transport', 'Register for gifts / set up contribution page'] },
        { phase: 'Details & paper', daysBefore: 120, tasks: ['Finalize menu and schedule tasting', 'Order invitations and build the event website', 'Book hair & makeup trial', 'Plan ceremony script, readings and vows', 'Order cake / dessert table'] },
        { phase: 'Send & confirm', daysBefore: 60, tasks: ['Mail invitations with RSVP deadline', 'Purchase rings and accessories', 'Confirm officiant, licence requirements and paperwork', 'Finalize playlist and do-not-play list', 'Create seating chart draft'] },
        { phase: 'Final countdown', daysBefore: 21, tasks: ['Chase RSVPs and give final headcount to caterer', 'Share run-of-show with all vendors', 'Confirm payment schedule and prepare tips in envelopes', 'Final dress / suit fitting', 'Assemble welcome bags and favors'] },
        { phase: 'Event week', daysBefore: 7, tasks: ['Rehearsal and rehearsal dinner', 'Pack emergency kit (sewing, stain pen, pain relief)', 'Hand off décor and signage to coordinator', 'Confirm transport pickup times', 'Rest, hydrate and enjoy!'] }
      ],
      vendors: [
        { name: 'Venue', icon: 'fa-building-columns', priority: 'high', share: 0.30, bookBy: 300, why: 'Everything else depends on the date and space.', questions: ['What is included (tables, chairs, linens, AV)?', 'Is there a preferred-vendor list or outside catering fee?', 'What are the noise curfew and end time?', 'What is the rain plan for outdoor spaces?', 'What is the deposit and cancellation policy?'] },
        { name: 'Caterer / bar service', icon: 'fa-utensils', priority: 'high', share: 0.24, bookBy: 280, why: 'Food is the most-remembered part of the guest experience.', questions: ['Is a tasting included?', 'How are dietary restrictions handled?', 'Are staff, rentals and gratuity included in the per-head price?', 'What is the final headcount deadline?'] },
        { name: 'Photographer', icon: 'fa-camera', priority: 'high', share: 0.08, bookBy: 270, why: 'Top photographers book 9–12 months out.', questions: ['Can we see a full wedding gallery, not just highlights?', 'How many hours and how many shooters?', 'What is the delivery timeline for edited photos?', 'Do we own print rights?'] },
        { name: 'Videographer', icon: 'fa-video', priority: 'medium', share: 0.03, bookBy: 240, why: 'Captures vows and toasts in motion.', questions: ['Highlight film length and full-ceremony edit?', 'Audio capture for vows?', 'Drone footage allowed at venue?'] },
        { name: 'Officiant', icon: 'fa-book-open', priority: 'high', share: 0.01, bookBy: 200, why: 'Legally required; personal fit matters.', questions: ['Will you help write a custom ceremony?', 'Do you handle the licence filing?', 'Will you attend the rehearsal?'] },
        { name: 'Florist / décor', icon: 'fa-seedling', priority: 'medium', share: 0.08, bookBy: 200, why: 'Sets the visual tone of the day.', questions: ['Which blooms are in season for our date?', 'Can ceremony flowers be repurposed at reception?', 'Delivery, setup and teardown included?'] },
        { name: 'DJ / live band', icon: 'fa-music', priority: 'medium', share: 0.06, bookBy: 200, why: 'Drives energy from ceremony to last dance.', questions: ['Do you MC announcements?', 'Backup equipment and backup performer?', 'How do you handle requests and do-not-play lists?'] },
        { name: 'Hair & makeup', icon: 'fa-wand-magic', priority: 'medium', share: 0.03, bookBy: 150, why: 'A trial run avoids day-of surprises.', questions: ['Is a trial included?', 'How many artists for the party size?', 'Touch-up kit or staying for the ceremony?'] },
        { name: 'Cake / desserts', icon: 'fa-cake-candles', priority: 'low', share: 0.02, bookBy: 120, why: 'Also a photo moment.', questions: ['Tasting available?', 'Delivery and on-site assembly?', 'Allergen-free options?'] },
        { name: 'Stationery & signage', icon: 'fa-envelope-open-text', priority: 'low', share: 0.02, bookBy: 120, why: 'First impression of the celebration.', questions: ['Turnaround and proof rounds?', 'Matching day-of signage and menus?'] },
        { name: 'Transport', icon: 'fa-bus', priority: 'low', share: 0.03, bookBy: 90, why: 'Keeps guests safe and on schedule.', questions: ['Capacity and number of runs?', 'Overtime rates?', 'Accessibility for wheelchair users?'] }
      ],
      ideas: {
        'Theme & décor': ['Monogram projection on the dance floor', 'Mixed-height candle clusters instead of tall centrepieces', 'A living greenery ceremony arch reused as the sweetheart-table backdrop', 'Hand-lettered welcome sign with your love story timeline'],
        'Food & drink': ['Signature his-and-hers cocktails named after your first date', 'Late-night snack station (sliders, fries, or local street food)', 'Family-style sharing platters to encourage conversation', 'Interactive dessert bar with a mini cake for each table'],
        'Ceremony & moments': ['Unity ritual rooted in your families’ traditions', 'Surprise flash-mob first dance with the wedding party', 'Ring warming passed through guests during the ceremony', 'Audio guestbook phone for recorded voice messages'],
        'Favors & gifts': ['Locally made jam or honey jars with custom labels', 'Donation to a cause in each guest’s name', 'Seed-paper thank-you cards that bloom when planted'],
        'Guest experience': ['Welcome bags with a weekend itinerary and local snacks', 'Photo booth with props from your shared hobbies', 'Kids’ corner with a sitter and craft kits', 'Live wedding painter capturing the reception']
      },
      tips: ['Book the venue, photographer and caterer first — they sell out soonest.', 'Keep a 5–10% contingency; tips and alterations always surprise people.', 'Give every vendor the same run-of-show document one week out.', 'Assign a non-family point person for day-of vendor questions.'],
      risks: [['Weather disrupts outdoor plans', 'Reserve a tent or indoor backup and set a go/no-go time 48h before.'], ['RSVPs come in late', 'Set the RSVP deadline 3 weeks early and call stragglers personally.'], ['Budget creep from “small” add-ons', 'Track every quote in one sheet and review weekly.']]
    },

    birthday: {
      budget: [
        ['Venue / space', 0.20, 'Hall, restaurant private room, park permit or home setup'],
        ['Food & cake', 0.30, 'Catering or platters, drinks, custom cake'],
        ['Decorations & theme', 0.13, 'Balloons, backdrop, tableware, lighting'],
        ['Entertainment & activities', 0.15, 'DJ, performer, games, photo booth'],
        ['Invitations & favors', 0.07, 'Digital invites, goodie bags, thank-you notes'],
        ['Photography', 0.07, 'Photographer or 360 booth'],
        ['Rentals & misc.', 0.03, 'Tables, chairs, sound system'],
        ['Contingency', 0.05, 'Last-minute extras']
      ],
      timeline: [
        { phase: 'Dream it up', daysBefore: 60, tasks: ['Pick a theme and colour palette with the guest of honour', 'Set the budget and guest list', 'Decide date, start time and duration', 'Shortlist venues or plan the home layout'] },
        { phase: 'Book the essentials', daysBefore: 42, tasks: ['Book venue or reserve park/community space', 'Book entertainment (DJ, performer, games host)', 'Order the custom cake', 'Design and send invitations with RSVP date'] },
        { phase: 'Design the party', daysBefore: 28, tasks: ['Order decorations, backdrop and tableware', 'Plan menu, snacks and drinks (note allergies)', 'Build the playlist', 'Plan 3–4 activities or games with a timeline'] },
        { phase: 'Prep & confirm', daysBefore: 14, tasks: ['Chase RSVPs and confirm final headcount', 'Confirm vendors and delivery times', 'Assemble goodie bags / favors', 'Order or buy gifts, candles and photo props'] },
        { phase: 'Party week', daysBefore: 5, tasks: ['Pick up decorations and non-perishables', 'Create a setup checklist and run-of-show', 'Charge cameras and speakers', 'Prep food that can be made ahead', 'Set up the night before if possible'] }
      ],
      vendors: [
        { name: 'Venue / space', icon: 'fa-house', priority: 'high', share: 0.20, bookBy: 42, why: 'Secures the date and sets capacity.', questions: ['Hours included and overtime fee?', 'Can we bring outside food and cake?', 'Setup / cleanup time included?', 'Parking and accessibility?'] },
        { name: 'Caterer / restaurant', icon: 'fa-utensils', priority: 'high', share: 0.22, bookBy: 30, why: 'Food anchors the party flow.', questions: ['Kid-friendly and allergy-safe options?', 'Delivery vs. staffed service?', 'Minimum order and final count date?'] },
        { name: 'Bakery (cake)', icon: 'fa-cake-candles', priority: 'high', share: 0.08, bookBy: 30, why: 'Custom cakes need lead time.', questions: ['Can you match the theme design?', 'Servings per tier?', 'Delivery or pickup?'] },
        { name: 'Entertainment', icon: 'fa-masks-theater', priority: 'medium', share: 0.15, bookBy: 35, why: 'Keeps guests engaged for the full duration.', questions: ['Age-appropriate set list / routine?', 'Set length and breaks?', 'Equipment and space needs?'] },
        { name: 'Decorator / balloon artist', icon: 'fa-palette', priority: 'medium', share: 0.13, bookBy: 28, why: 'Backdrops make the photos.', questions: ['Installation and removal included?', 'Can the backdrop double as the photo spot?'] },
        { name: 'Photographer / photo booth', icon: 'fa-camera', priority: 'low', share: 0.07, bookBy: 21, why: 'Memories without someone stuck behind a phone.', questions: ['Hours of coverage?', 'Instant prints or digital gallery?'] },
        { name: 'Rentals (tables, chairs, sound)', icon: 'fa-chair', priority: 'low', share: 0.03, bookBy: 14, why: 'Fills gaps the venue doesn’t cover.', questions: ['Delivery window?', 'Damage policy?'] }
      ],
      ideas: {
        'Theme & décor': ['Balloon garland in the honouree’s favourite colours', 'A “through the years” photo timeline wall', 'Custom banner and matching cake topper', 'Table of childhood (or career) memorabilia'],
        'Food & drink': ['Build-your-own taco / pizza / sundae station', 'Mocktail bar with a signature drink named after the honouree', 'Mini desserts instead of one giant cake for easy serving', 'A snack board shaped like the age number'],
        'Entertainment & activities': ['Trivia quiz about the honouree with small prizes', 'Karaoke or lip-sync battle rounds', 'Scavenger hunt themed to the party', 'Guest video messages compiled into a surprise reel'],
        'Favors & gifts': ['Personalized cookies with the honouree’s face', 'Mini succulents or plant kits', 'A polaroid from the booth in a themed frame'],
        'Memorable moments': ['Surprise guest appearance (video or in person)', 'A memory jar for guests to drop notes', 'Group toast slideshow with a short speech by a close friend']
      },
      tips: ['Plan activities in 20–30 minute blocks so energy never dips.', 'Send invitations 4 weeks out and a reminder 1 week before.', 'Buy 15% more food than you think and skip items with short prep windows.', 'Set up a clear photo spot with good light near the entrance.'],
      risks: [['Low turnout from late RSVPs', 'Send a friendly reminder a week out and keep food orders flexible.'], ['Weather for outdoor parties', 'Have a canopy or indoor alternative and tell guests the plan.'], ['Running over time', 'Assign a friend as timekeeper for cake and speeches.']]
    },

    community: {
      budget: [
        ['Venue, permits & insurance', 0.20, 'Space hire, council permits, public liability'],
        ['Food & beverages', 0.18, 'Catering, food trucks, water stations'],
        ['Staging, sound & AV', 0.14, 'Stage, PA, mics, projector, power'],
        ['Marketing & printing', 0.10, 'Flyers, social ads, banners, signage'],
        ['Entertainment & speakers', 0.12, 'Performers, hosts, speaker fees'],
        ['Rentals & infrastructure', 0.10, 'Tents, tables, chairs, toilets, fencing'],
        ['Volunteers & staffing', 0.05, 'T-shirts, meals, security'],
        ['Accessibility & safety', 0.04, 'First aid, ramps, interpreters'],
        ['Contingency', 0.07, 'Weather and last-minute needs']
      ],
      timeline: [
        { phase: 'Purpose & partners', daysBefore: 150, tasks: ['Define goals, audience and success metrics', 'Form an organizing committee and assign roles', 'Set budget and identify sponsors / grants', 'Choose date and shortlist venues', 'Check permit and insurance requirements'] },
        { phase: 'Secure & structure', daysBefore: 110, tasks: ['Book venue and apply for permits', 'Confirm key speakers, performers or activities', 'Lock sponsors and in-kind partners', 'Create run-of-show skeleton and site map', 'Set up registration / ticketing page'] },
        { phase: 'Promote & provision', daysBefore: 70, tasks: ['Launch marketing: social, posters, local press, community groups', 'Book food vendors, AV and rentals', 'Recruit and schedule volunteers', 'Arrange first aid, security and accessibility services', 'Design signage and wayfinding'] },
        { phase: 'Finalize operations', daysBefore: 30, tasks: ['Confirm all vendors and delivery windows', 'Finalize run-of-show and emergency plan', 'Volunteer briefing session', 'Print signage, badges and programmes', 'Send reminder communications to registrants'] },
        { phase: 'Event week', daysBefore: 7, tasks: ['Site walk-through with key vendors', 'Pack supplies kit (tape, zip ties, radios, chargers)', 'Final weather check and backup decision', 'Setup day: zones, signage, AV test', 'Post-event: thank-yous, survey, financial reconciliation'] }
      ],
      vendors: [
        { name: 'Venue / site', icon: 'fa-map-location-dot', priority: 'high', share: 0.14, bookBy: 110, why: 'Capacity, permits and layout flow from here.', questions: ['Capacity and accessibility compliance?', 'Power, water and waste access?', 'Permit requirements and noise limits?', 'Wet-weather alternative?'] },
        { name: 'Insurance & permits', icon: 'fa-file-shield', priority: 'high', share: 0.06, bookBy: 100, why: 'Legally required for public gatherings.', questions: ['Public liability coverage amount?', 'Lead time for permit approval?', 'Food handling and alcohol licences needed?'] },
        { name: 'Sound, stage & AV', icon: 'fa-volume-high', priority: 'high', share: 0.14, bookBy: 70, why: 'Nothing works if people can’t hear.', questions: ['Technician on site all day?', 'Backup power and equipment?', 'Hearing-loop or caption support?'] },
        { name: 'Food vendors / caterer', icon: 'fa-truck', priority: 'high', share: 0.18, bookBy: 70, why: 'Keeps attendees on site and happy.', questions: ['Health permits and insurance?', 'Dietary variety (veg, halal, gluten-free)?', 'Fee or revenue share arrangement?'] },
        { name: 'Rentals (tents, tables, toilets)', icon: 'fa-tent', priority: 'medium', share: 0.10, bookBy: 60, why: 'Comfort and weather protection.', questions: ['Delivery and collection windows?', 'Accessible toilet units?', 'Weighting for tents on hard ground?'] },
        { name: 'Entertainment & speakers', icon: 'fa-microphone', priority: 'medium', share: 0.12, bookBy: 80, why: 'Draws the crowd and shapes the programme.', questions: ['Technical rider?', 'Set length and fee?', 'Promotion support on their channels?'] },
        { name: 'Marketing & print', icon: 'fa-bullhorn', priority: 'medium', share: 0.10, bookBy: 70, why: 'Attendance depends on reach.', questions: ['Turnaround for banners and flyers?', 'Weather-proof materials?'] },
        { name: 'First aid & security', icon: 'fa-kit-medical', priority: 'high', share: 0.05, bookBy: 45, why: 'Duty of care for attendees.', questions: ['Staff-to-attendee ratio?', 'Incident reporting process?'] },
        { name: 'Photographer / media', icon: 'fa-camera', priority: 'low', share: 0.04, bookBy: 30, why: 'Content for sponsors and next year’s promo.', questions: ['Same-day highlights for social?', 'Consent signage for crowd photos?'] }
      ],
      ideas: {
        'Programme & activities': ['Opening ceremony with a local community leader or elder', 'Hands-on workshop zone (crafts, repair café, gardening)', 'Open-mic hour for local talent', 'Kids’ zone with face painting and story corner'],
        'Food & drink': ['Local food-truck lineup with a “passport” stamp card', 'Community potluck table with recipe cards', 'Free water refill station with branded cups', 'Cultural food showcase from neighbourhood groups'],
        'Engagement & impact': ['Pledge wall or ideas board for the community', 'Volunteer sign-up booth with instant roles', 'Sponsor “thank-you” wall and shout-outs from stage', 'Live fundraising thermometer'],
        'Sustainability': ['Zero-waste stations with clear sorting signage', 'Bike valet and shuttle from transit', 'Reusable or compostable serviceware', 'Digital programme via QR codes instead of print'],
        'Promotion': ['Short teaser videos featuring local faces', 'Partner with schools, places of worship and clubs for outreach', 'Hashtag and photo frame for social sharing', 'Local radio / newsletter features']
      },
      tips: ['Apply for permits and insurance first — approvals can take weeks.', 'Build the run-of-show around power and sound checks.', 'Over-recruit volunteers by 20%; some always drop out.', 'Have an emergency plan everyone on the committee has read.'],
      risks: [['Permit delays', 'Submit early and keep a backup venue with fewer permit needs.'], ['Weather', 'Tents for key zones and a published rain date.'], ['Low attendance', 'Partner with 5+ community organizations for cross-promotion.'], ['Safety incident', 'First aid on site, radios for staff, clear incident protocol.']]
    }
  };
  TEMPLATES.other = TEMPLATES.community;

  const VIBE_IDEAS = {
    'Elegant': ['Black-tie dress code with a champagne tower welcome', 'Classic string quartet during arrivals'],
    'Rustic': ['Mason-jar lighting and wooden crate displays', 'Barn or orchard setting with hay-bale seating'],
    'Modern': ['Monochrome palette with geometric acrylic signage', 'Neon sign with a custom phrase as the photo spot'],
    'Bohemian': ['Macramé backdrop with pampas grass and dried florals', 'Low lounge seating with layered rugs and floor cushions'],
    'Vintage': ['Vinyl record guestbook and a retro photo booth', 'Mismatched china and lace table runners'],
    'Glamorous': ['Sequin table linens with gold candelabras', 'Red-carpet entrance with a step-and-repeat backdrop'],
    'Minimalist': ['Single-stem bud vases and clean typography', 'Neutral palette with one bold accent colour'],
    'Tropical': ['Monstera-leaf place cards and pineapple centrepieces', 'Tiki-style drink bar with fresh fruit garnishes'],
    'Playful': ['Giant lawn games and a confetti cannon moment', 'Colour-block balloon installations'],
    'Eco-friendly': ['Potted plants as décor guests take home', 'Digital invitations and compostable serviceware'],
    'Traditional': ['Incorporate ceremonial rituals, attire and music from your heritage', 'Family recipes featured on the menu with story cards'],
    'Cozy': ['Candlelit tables, blankets and a hot-drink bar', 'Acoustic live music and a fireside lounge']
  };

  const TAGLINES = {
    wedding: ['Two stories, one celebration.', 'A day as unique as your love.', 'Where forever begins.'],
    birthday: ['Another trip around the sun, celebrated right.', 'Make a wish — we handle the rest.', 'A party worth remembering.'],
    community: ['Bringing people together, on purpose.', 'Built by the community, for the community.', 'Where neighbours become friends.']
  };

  function pick(arr, seed) { return arr[seed % arr.length]; }
  function round(n) { return Math.round(n / 10) * 10; }
  function hash(str) { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

  function generate(brief) {
    const type = TEMPLATES[brief.type] ? brief.type : 'other';
    const t = TEMPLATES[type];
    const total = Number(brief.budget) || 0;
    const guests = Number(brief.guests) || 50;
    const seed = hash(brief.name + brief.date);
    const vibes = Array.isArray(brief.vibe) ? brief.vibe : [];
    const daysUntil = Math.max(1, Math.round((new Date(brief.date) - new Date()) / 86400000));

    // Budget — allocate shares, then adjust the last line to hit the total exactly
    let items = t.budget.map(([category, share, notes]) => ({ category, amount: round(total * share), notes }));
    const allocated = items.reduce((s, i) => s + i.amount, 0);
    items[items.length - 1].amount += total - allocated;
    if (brief.setting === 'Virtual / hybrid') {
      items = items.map(i => i.category.toLowerCase().includes('venue') ? { ...i, category: 'Platform, streaming & tech', notes: 'Video platform, streaming crew, mailed kits' } : i);
    }

    // Timeline — compress phases proportionally if the event is sooner than the template horizon
    const horizon = t.timeline[0].daysBefore;
    const scale = daysUntil < horizon ? daysUntil / horizon : 1;
    const timeline = t.timeline.map(p => ({
      phase: p.phase,
      daysBefore: Math.max(1, Math.round(p.daysBefore * scale)),
      tasks: [...p.tasks]
    }));
    if (brief.mustHaves) timeline[Math.min(1, timeline.length - 1)].tasks.push(`Source must-haves: ${brief.mustHaves}`);
    if (brief.dietary) timeline[Math.min(2, timeline.length - 1)].tasks.push(`Brief caterer on dietary needs: ${brief.dietary}`);

    // Vendors
    const vendors = t.vendors.map(v => ({
      name: v.name, icon: v.icon, priority: v.priority,
      estimatedCost: round(total * v.share),
      bookByDaysBefore: Math.max(1, Math.round(v.bookBy * scale)),
      why: v.why, questions: [...v.questions]
    }));
    if (brief.setting && brief.setting.startsWith('Outdoor')) {
      vendors.push({ name: 'Tent / weather backup', icon: 'fa-cloud-sun-rain', priority: 'high', estimatedCost: round(total * 0.04), bookByDaysBefore: Math.max(1, Math.round(60 * scale)), why: 'Outdoor settings need a rain plan.', questions: ['Hold-and-release deadline for the tent?', 'Sidewalls, heaters and flooring options?'] });
    }

    // Ideas — template + vibe-personalized
    const ideas = Object.entries(t.ideas).map(([category, list]) => ({ category, items: [...list] }));
    const vibeItems = vibes.flatMap(v => VIBE_IDEAS[v] || []);
    if (vibeItems.length) ideas.unshift({ category: `Your vibe: ${vibes.join(' · ')}`, items: vibeItems });
    if (brief.honoree) ideas.push({ category: `Personal touches for ${brief.honoree}`, items: [`Weave ${brief.honoree}'s favourite colours, music and foods into the theme`, `A short tribute video or speech segment celebrating ${brief.honoree}`, `A keepsake (photo book or signed print) presented to ${brief.honoree} at the end`] });

    const perGuest = guests ? Math.round(total / guests) : 0;
    const summary = `${brief.name} is a ${type === 'other' ? '' : type + ' '}event for about ${guests} guests in ${brief.location || 'your chosen location'}, planned ${daysUntil} days out with a ${brief.currency || ''} ${total.toLocaleString()} budget (~${perGuest.toLocaleString()} per guest). ` +
      (vibes.length ? `The style leans ${vibes.join(', ').toLowerCase()}. ` : '') +
      `This plan allocates the budget across ${items.length} categories, sequences ${timeline.length} planning phases backward from the date, prioritises ${vendors.filter(v => v.priority === 'high').length} must-book vendors, and offers personalized ideas. Generated by the built-in Smart Planner (template-based) — connect an AI provider for a fully bespoke plan.`;

    return {
      title: brief.name,
      tagline: pick(TAGLINES[type] || TAGLINES.community, seed),
      summary,
      budget: { total, currency: brief.currency || 'USD', perGuest, items },
      timeline,
      vendors,
      ideas,
      tips: [...t.tips],
      risks: t.risks.map(([risk, mitigation]) => ({ risk, mitigation }))
    };
  }

  /** Lightweight offline chat so the assistant still answers without an AI key. */
  function chat(message, plan) {
    const m = message.toLowerCase();
    const cur = plan?.budget?.currency || '';
    if (/budget|money|cost|save|cheap/.test(m)) {
      const top = [...(plan?.budget?.items || [])].sort((a, b) => b.amount - a.amount).slice(0, 3);
      return `**Budget snapshot** (Smart Planner, offline)\n\nYour three largest lines are:\n${top.map(i => `- **${i.category}** — ${cur} ${i.amount.toLocaleString()}`).join('\n')}\n\nTo save money: trim décor by reusing ceremony pieces, choose an off-peak day/time, shorten the bar service window, and go digital on invitations. Connect an AI provider in settings for tailored, line-by-line suggestions.`;
    }
    if (/invit/.test(m)) {
      return `**Invitation draft**\n\nYou're warmly invited to **${plan?.title || 'our event'}**!\n\n📅 ${plan?.brief?.date || '[date]'}  ·  📍 ${plan?.brief?.location || '[location]'}\n\nJoin us for an unforgettable celebration. Kindly RSVP by [date] so we can plan the perfect day.\n\n_Connect an AI provider for a fully personalized tone and multiple variations._`;
    }
    if (/rain|weather|backup|plan b/.test(m)) {
      return `**Backup plan**\n\n1. Confirm a covered or indoor alternative with your venue now.\n2. Set a go/no-go decision time 48 hours before the event.\n3. Pre-write the guest message you'd send if plans change.\n4. Hold a tent quote with a late release date.\n5. Keep umbrellas, towels and floor protection in your supplies kit.`;
    }
    if (/schedule|run of show|timeline|day-of|day of/.test(m)) {
      const t = plan?.timeline?.at(-1);
      return `**Day-of outline**\n\n- T-4h: Vendor arrivals, setup, sound check\n- T-1h: Final walkthrough; welcome team in place\n- T-0: Doors / arrivals\n- +45m: Main programme begins\n- +2h: Food service\n- +3h: Speeches / key moment\n- +4h: Entertainment peak\n- Close: Farewell, teardown, tips\n\nYour final planning phase (“${t?.phase || 'Event week'}”) has ${t?.tasks?.length || 0} tasks to close out before this.`;
    }
    if (/idea|theme|unique|touch/.test(m)) {
      const first = plan?.ideas?.[0];
      return `**Ideas from your plan**\n\n${(first?.items || []).map(i => `- ${i}`).join('\n')}\n\nSee the **Ideas** tab for more categories, or connect an AI provider for fresh, personalized suggestions.`;
    }
    return `I'm running in **offline Smart Planner mode**, so I can answer basic questions about budget, invitations, backup plans, the day-of schedule and ideas.\n\nFor open-ended help (vendor emails, toasts, negotiation tips, custom themes) connect a Generative AI provider via the **AI** button in the top bar — Gemini and Groq offer free tiers.`;
  }

  global.SmartPlanner = { generate, chat };
})(window);
