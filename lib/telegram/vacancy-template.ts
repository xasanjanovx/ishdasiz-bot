import type { VacancyDraft } from '../ai/vacancy-draft';

const h = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** FLOW's channel template, with a strict Telegram size budget and escaped data. */
export function formatVacancyTemplate(draft: VacancyDraft, lang: 'ru' | 'uz' = 'uz', jobId?: string): string {
  const ru = lang === 'ru';
  const footer = `\n\n<a href="https://t.me/ishdasiz"><b>ISHDASIZ</b></a>`;
  const jobLink = jobId && /^[0-9a-f-]{36}$/i.test(jobId) ? `\n<a href="https://ishdasiz.uz/jobs/${jobId}">${ru ? 'Полная вакансия и отклик' : 'To‘liq vakansiya va ariza'}</a>` : '';
  const contacts = [
    draft.phones.length ? `📞 ${h(draft.phones.join(' | '))}` : '',
    draft.telegram ? `✈️ ${h(draft.telegram)}` : '',
  ].filter(Boolean).join('\n');
  const tail = `\n\n${contacts}${jobLink}${footer}`;
  const lines = [`✅ <b>${h(draft.title)}</b>`];
  const add = (text: string) => {
    if (lines.join('\n').length + text.length + tail.length + 40 > 3900) return false;
    lines.push(text); return true;
  };
  for (const [label, value] of [
    [ru ? 'Компания' : 'Kompaniya', draft.company],
    [ru ? 'Регион' : 'Hudud', draft.region],
    [ru ? 'Адрес' : 'Manzil', draft.address],
    [ru ? 'Зарплата' : 'Oylik maosh', draft.salary],
    [ru ? 'График' : 'Ish vaqti', draft.schedule],
  ]) if (value) add(`<b>${label}:</b> ${h(value)}`);
  let omitted = false;
  for (const [label, items] of [
    [ru ? 'Требования' : 'Talablar', draft.requirements],
    [ru ? 'Обязанности' : 'Vazifalar', draft.duties],
    [ru ? 'Условия' : 'Qulayliklar', draft.benefits],
    [ru ? 'Дополнительно' : 'Qo‘shimcha ma’lumotlar', draft.details],
  ] as const) {
    if (!items.length) continue;
    if (!add(`\n<b>${label}:</b>`)) { omitted = true; continue; }
    for (const item of Array.from(new Set(items))) if (!add(`• ${h(item)}`)) omitted = true;
  }
  if (omitted) lines.push(ru ? '\n… Подробнее в полной вакансии.' : '\n… Batafsil to‘liq vakansiyada.');
  return lines.join('\n') + tail;
}

export function vacancyDraftToJob(draft: VacancyDraft, base: Record<string, any>) {
  const company = draft.company || base.company_name || null;
  const phone = draft.phones[0] || base.contact_phone || null;
  const template = { ...draft, company, phones: draft.phones.length ? draft.phones : phone ? [phone] : [] };
  return {
    ...base, title: draft.title, company_name: company,
    address: draft.address, region_name: draft.region,
    // Website numeric salary columns are UZS. Preserve foreign currency as text.
    salary_min: draft.currency === 'UZS' ? draft.salary_min : null,
    salary_max: draft.currency === 'UZS' ? draft.salary_max : null,
    contact_phone: phone, contact_telegram: draft.telegram,
    working_hours: draft.schedule, benefits: draft.benefits,
    description: [draft.salary, draft.schedule, ...draft.details, ...draft.requirements, ...draft.duties, ...draft.benefits].filter(Boolean).join('\n') || draft.title,
    ai_sections: { talablar: draft.requirements, ish_vazifalari: draft.duties, qulayliklar: draft.benefits },
    raw_source_json: { vacancy_template: template },
    job_create_mode: 'ai',
  };
}
