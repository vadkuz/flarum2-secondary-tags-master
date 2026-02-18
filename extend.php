<?php

use Flarum\Api\Schema;
use Flarum\Extend;
use Flarum\Tags\Api\Resource\TagResource;
use Flarum\Tags\Tag;
use Illuminate\Database\DatabaseManager;
use Tobyz\JsonApiServer\Context;

return [
    (new Extend\Frontend('admin'))
        ->js(__DIR__.'/js/dist/admin.js'),

    (new Extend\Frontend('forum'))
        ->js(__DIR__.'/js/dist/forum.js'),

    (new Extend\ApiResource(TagResource::class))
        ->fields(function () {
            $table = 'vadkuz_secondary_tag_primary_tag';
            /** @var DatabaseManager $db */
            $db = resolve('db');

            // Expose and accept an array of allowed primary tag IDs for a secondary tag.
            // Empty array means "global secondary tag" (no restriction).
            return [
                Schema\Arr::make('secondaryPrimaryTagIds')
                    ->get(function (Tag $tag) use ($db, $table) {
                        // Only applies to secondary tags. For primary tags return an empty list.
                        if ((bool) ($tag->is_primary ?? false)) {
                            return [];
                        }

                        static $map = null;
                        if ($map === null) {
                            $map = [];

                            foreach ($db->table($table)->get(['secondary_tag_id', 'primary_tag_id']) as $row) {
                                $secondaryId = (int) $row->secondary_tag_id;
                                $primaryId = (int) $row->primary_tag_id;

                                $map[$secondaryId] ??= [];
                                $map[$secondaryId][] = $primaryId;
                            }
                        }

                        return $map[(int) $tag->id] ?? [];
                    })
                    ->writable(fn (Tag $tag, \Flarum\Api\Context $context) => $context->getActor()->isAdmin())
                    ->save(function (Tag $tag, mixed $value, Context $context) use ($db, $table) {
                        // Runs after the model is saved (important for creates).
                        if (! $context->getActor()->isAdmin()) {
                            return;
                        }

                        // Only store restrictions for secondary tags.
                        if ((bool) ($tag->is_primary ?? false)) {
                            $db->table($table)->where('secondary_tag_id', $tag->id)->delete();
                            return;
                        }

                        $ids = [];
                        if (is_array($value)) {
                            foreach ($value as $id) {
                                if (is_numeric($id)) {
                                    $ids[] = (int) $id;
                                }
                            }
                        }

                        $ids = array_values(array_unique(array_filter($ids, fn ($id) => $id > 0)));

                        // Keep only existing primary tags.
                        if ($ids) {
                            $ids = $db->table('tags')
                                ->whereIn('id', $ids)
                                ->where('is_primary', 1)
                                ->pluck('id')
                                ->map(fn ($id) => (int) $id)
                                ->all();
                        }

                        $db->table($table)->where('secondary_tag_id', $tag->id)->delete();

                        if ($ids) {
                            $rows = array_map(
                                fn (int $primaryId) => [
                                    'secondary_tag_id' => (int) $tag->id,
                                    'primary_tag_id' => $primaryId,
                                ],
                                $ids
                            );
                            $db->table($table)->insert($rows);
                        }
                    }),
            ];
        }),

    new Extend\Locales(__DIR__.'/locale'),
];
