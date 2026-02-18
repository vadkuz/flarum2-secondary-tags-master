<?php

/*
 * This file is part of a Flarum extension.
 */

use Flarum\Database\Migration;
use Illuminate\Database\Schema\Blueprint;

return Migration::createTable(
    'vadkuz_secondary_tag_primary_tag',
    function (Blueprint $table) {
        $table->integer('secondary_tag_id')->unsigned();
        $table->integer('primary_tag_id')->unsigned();

        $table->primary(['secondary_tag_id', 'primary_tag_id']);

        $table->foreign('secondary_tag_id')->references('id')->on('tags')->onDelete('cascade');
        $table->foreign('primary_tag_id')->references('id')->on('tags')->onDelete('cascade');
    }
);

