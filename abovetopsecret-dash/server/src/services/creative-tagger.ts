import Anthropic from '@anthropic-ai/sdk';
import pool from '../db';

const TAG_SCHEMA = {
  asset_type: ['UGC', 'studio_shot', 'lifestyle', 'testimonial', 'product_demo', 'animation', 'other'],
  visual_format: ['static_image', 'video_short', 'video_long', 'carousel', 'gif', 'slideshow'],
  hook_type: ['question', 'bold_claim', 'social_proof', 'pain_point', 'curiosity', 'shock', 'story', 'other'],
  creative_angle: ['benefit_led', 'feature_led', 'emotion_led', 'comparison', 'demo', 'unboxing', 'before_after', 'other'],
  messaging_theme: ['discount', 'urgency', 'aspiration', 'education', 'fear_of_missing', 'trust', 'exclusivity', 'other'],
  talent_type: ['founder', 'influencer', 'customer', 'actor', 'voiceover_only', 'none'],
  offer_type: ['percentage_off', 'bogo', 'free_shipping', 'bundle', 'free_gift', 'no_offer'],
  cta_style: ['shop_now', 'learn_more', 'get_started', 'claim_offer', 'watch_more', 'try_free', 'other'],
};

interface UntaggedCreative {
  id: number;
  ad_copy: string | null;
  headline: string | null;
  cta_type: string | null;
  creative_type: string | null;
  image_url: string | null;
}

interface TagResult {
  asset_type: string;
  visual_format: string;
  hook_type: string;
  creative_angle: string;
  messaging_theme: string;
  talent_type: string;
  offer_type: string;
  cta_style: string;
}

export async function tagUntaggedCreatives(userId?: number): Promise<{ tagged: number; skipped: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { tagged: 0, skipped: 0 };
  }

  // Find untagged creatives
  const userFilter = userId ? 'AND ac.user_id = $1' : '';
  const params: any[] = userId ? [userId] : [];

  const result = await pool.query(
    `SELECT ac.id, ac.ad_copy, ac.headline, ac.cta_type, ac.creative_type, ac.image_url
     FROM ad_creatives ac
     LEFT JOIN creative_tags ct ON ct.creative_id = ac.id
     WHERE ct.id IS NULL ${userFilter}
     ORDER BY ac.created_at DESC
     LIMIT 20`,
    params
  );

  const untagged: UntaggedCreative[] = result.rows;
  if (untagged.length === 0) return { tagged: 0, skipped: 0 };

  const client = new Anthropic({ apiKey });
  let tagged = 0;
  let skipped = 0;

  // Process in batches of 5
  for (let i = 0; i < untagged.length; i += 5) {
    const batch = untagged.slice(i, i + 5);

    for (const creative of batch) {
      try {
        const details = [
          creative.ad_copy ? `Ad Copy: ${creative.ad_copy.slice(0, 500)}` : '',
          creative.headline ? `Headline: ${creative.headline}` : '',
          creative.cta_type ? `CTA: ${creative.cta_type}` : '',
          creative.creative_type ? `Format: ${creative.creative_type}` : '',
        ].filter(Boolean).join('\n');

        if (!details) {
          skipped++;
          continue;
        }

        const response = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: `Classify this ad creative into exactly these 8 tag dimensions. Return ONLY valid JSON, no other text.

Ad Creative:
${details}

Return JSON with these exact fields and only values from the allowed lists:
- asset_type: ${TAG_SCHEMA.asset_type.join('|')}
- visual_format: ${TAG_SCHEMA.visual_format.join('|')}
- hook_type: ${TAG_SCHEMA.hook_type.join('|')}
- creative_angle: ${TAG_SCHEMA.creative_angle.join('|')}
- messaging_theme: ${TAG_SCHEMA.messaging_theme.join('|')}
- talent_type: ${TAG_SCHEMA.talent_type.join('|')}
- offer_type: ${TAG_SCHEMA.offer_type.join('|')}
- cta_style: ${TAG_SCHEMA.cta_style.join('|')}`,
          }],
        });

        const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          skipped++;
          continue;
        }

        const tags: TagResult = JSON.parse(jsonMatch[0]);

        await pool.query(
          `INSERT INTO creative_tags (creative_id, asset_type, visual_format, hook_type, creative_angle,
            messaging_theme, talent_type, offer_type, cta_style, ai_confidence, tagged_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0.85, NOW())
           ON CONFLICT (creative_id) DO UPDATE SET
             asset_type = EXCLUDED.asset_type, visual_format = EXCLUDED.visual_format,
             hook_type = EXCLUDED.hook_type, creative_angle = EXCLUDED.creative_angle,
             messaging_theme = EXCLUDED.messaging_theme, talent_type = EXCLUDED.talent_type,
             offer_type = EXCLUDED.offer_type, cta_style = EXCLUDED.cta_style,
             ai_confidence = EXCLUDED.ai_confidence, tagged_at = NOW()`,
          [creative.id, tags.asset_type, tags.visual_format, tags.hook_type,
           tags.creative_angle, tags.messaging_theme, tags.talent_type,
           tags.offer_type, tags.cta_style]
        );
        tagged++;
      } catch (err) {
        console.error(`[Creative Tagger] Error tagging creative ${creative.id}:`, err);
        skipped++;
      }
    }

    // Rate limit: pause between batches
    if (i + 5 < untagged.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`[Creative Tagger] Tagged ${tagged}, skipped ${skipped}`);
  return { tagged, skipped };
}
