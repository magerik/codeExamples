<?php

/*
homesoverseas.ru
Данный скрипт создаёт копию таблицы 'objects' в оперативной памяти без больших текстовых полей.
Новая таблица 'objects_fast' используется только для чтения и обновляется раз в 6 минут.
Этот механизм позволил существенно ускорить работу сайта.

This script creates a copy of the 'objects' table in RAM without large text fields.
The new table 'objects_fast' is read-only and is updated every 6 minutes.
This mechanism made it possible to significantly speed up the operation of the site.
*/

require('/var/www/homes/inc/settings.php');

if (!$logged_in or !$user->role or $user->role != 'admin') {
    die('нет доступа');
}


function create_objects_fast($table_name = 'objects_fast')
{
    $obj = admin_get_row("SELECT * FROM objects limit 1");

    $fields = [];
    foreach ($obj as $f => $v) {
        if (in_array($f, ['title', 'annotation', 'description', 'alias', 'page_title', 'title_eng', 'annotation_eng', 'description_eng'])) continue;
        if (substr($f, 0, 5) == 'lock_') continue;
        $fields[] = $f;
    }

    admin_mysql_query("CREATE TABLE IF NOT EXISTS $table_name ENGINE=MEMORY SELECT " . implode(",", $fields) . " FROM objects WHERE isActive='Y' and isArchive='N'");
    admin_mysql_query("ALTER TABLE `$table_name` ADD INDEX `country` (`country`), ADD INDEX `region` (`region`), ADD INDEX `subregion` (`subregion`), ADD INDEX `realtytype` (`realtytype`), ADD INDEX `realtysubtype` (`realtysubtype`)");
}


$t = $timer->stop();

admin_get_row("DROP TABLE IF EXISTS objects_fast_old"); // на всякий случай удаляем, если вдруг эта таблица есть (чтобы переименование прошло удачно)

create_objects_fast('objects_fast_new');

admin_get_row("RENAME TABLE objects_fast TO objects_fast_old, objects_fast_new TO objects_fast");

admin_get_row("DROP TABLE IF EXISTS objects_fast_old");

$t = $timer->stop() - $t;
echo "\r\n" . date('Y-m-d H:i:s') . " time of creating table objects_fast:" . $t;
