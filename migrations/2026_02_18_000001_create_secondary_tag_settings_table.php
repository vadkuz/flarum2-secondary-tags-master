<?php

/*
 * This file is part of a Flarum extension.
 */

use Flarum\Database\Migration;
use Illuminate\Database\Schema\Blueprint;

return Migration::createTable(
    'vadkuz_secondary_tag_settings',
    function (Blueprint $table) {
        $table->integer('secondary_tag_id')->unsigned();
        $table->boolean('listed')->default(true);

        $table->primary(['secondary_tag_id']);

        $table->foreign('secondary_tag_id')->references('id')->on('tags')->onDelete('cascade');
    }
);

