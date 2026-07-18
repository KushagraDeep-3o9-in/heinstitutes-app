function collegeSchema(inst, canonicalUrl) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollegeOrUniversity',
    name: inst.name,
    url: canonicalUrl,
    address: {
      '@type': 'PostalAddress',
      streetAddress: inst.address1 || undefined,
      addressLocality: inst.districtName || undefined,
      addressRegion: inst.stateName || undefined,
      addressCountry: 'IN',
    },
  };
  if (inst.webSite) {
    const cleaned = String(inst.webSite).match(/\((https?:\/\/[^)]+)\)/);
    schema.sameAs = cleaned ? cleaned[1] : undefined;
  }
  if (inst.yearOfEstablishment) schema.foundingDate = String(inst.yearOfEstablishment);
  return schema;
}

function breadcrumbSchema(items) {
  // items: [{ name, url }]
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

function faqSchema(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

module.exports = { collegeSchema, breadcrumbSchema, faqSchema };
