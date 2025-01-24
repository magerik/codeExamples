<?php
/*
Скрипт выставляет случайный порядок для работ на сайте со следующими условиями:
- работы одного автора могут идти подряд не более двух раз
- работы из одной выставки также могут идти подряд не более двух раз

*/


namespace App\Console\Commands\Items;

use Illuminate\Console\Command;

use App\Models\Item;


class RandomOrder extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'items:random-order';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Set random order to items';

    public $order_start = 10000;
    public $order_end = 100000;


    /**
     * Execute the console command.
     *
     * @return int
     */
    public function handle()
    {

        $artworks = Item::where('order_fix', false)
            ->with(['artists', 'exhibitions'])
            ->get();


        for($j=1;$j<=50;$j++){
            
            $res = self::makeRes($artworks);
            
            for($i=1; $i <= count($res); $i++){
                    
                $key = self::checkRepeats($res);
                if( ! $key  ) break;

                $res[$key]['order'] = rand($this->order_start, $this->order_end);

                usort($res, function($a, $b){
                    return $a['order'] > $b['order'];
                });

            }

            $key = self::checkRepeats($res);
            if( ! $key  ) break; 

        }
        
        self::showRes($res);

        self::writeRes($res);

        return Command::SUCCESS;
    }


    public function writeRes($res)
    {
        foreach($res as $r){
            $art = Item::find($r['id']);
            $art->order = $r['order'];
            $art->save();    
        }
    }


    public function checkRepeats($res)
    {
        $repeats = 0;
        foreach($res as $key => $r){

            if($key < 2) continue;
            
            $intersec_exhibitions = array_intersect($res[$key]['exhibitions'], $res[$key-1]['exhibitions'], $res[$key-2]['exhibitions']);

            if( count($intersec_exhibitions) >0 ) return $key;
            
            $intersec_artists = array_intersect($res[$key]['artists'], $res[$key-1]['artists'], $res[$key-2]['artists']);

            if( count($intersec_artists) > 0) return $key;
            
        }
        
        return false;
        
    }

    public function showRes($res)
    {

        echo "<table border=1 cellspacing=0>
            <tr>
                <th>item id</th>
                <th>exhibitions</th>
                <th>artists</th>
                <th>order</th>
                <th>intersec exhibitions</th>
                <th>intersec artists</th>
            </tr>";
        foreach($res as $key => $r){

            $intersec_exhibitions = [];
            $intersec_artists = [];

            if($key >= 2) {
                $intersec_exhibitions = array_intersect($res[$key]['exhibitions'], $res[$key-1]['exhibitions'], $res[$key-2]['exhibitions']);

                $intersec_artists = array_intersect($res[$key]['artists'], $res[$key-1]['artists'], $res[$key-2]['artists']);
            }


            echo "
            <tr>
            <td>{$r['id']}</td>
            <td>".implode(', ', $r['exhibitions'])."</td>
            <td>".implode(', ', $r['artists'])."</td>
            <td>{$r['order']}</td>
            <td>".implode(', ', $intersec_exhibitions)."</td>
            <td>".implode(', ', $intersec_artists)."</td>
            </tr>
            ";
        }
        echo "</table>";
    }

    public function makeRes($artworks) // Set random order to all
    {
        $res = [];
        foreach($artworks as $item){
            $arr = [];
            $arr['id'] = $item->id;
            $arr['artists'] = [];
            $arr['exhibitions'] = [];

            foreach($item->exhibitions as $e) $arr['exhibitions'][] = $e->id;
            foreach($item->artists as $a) $arr['artists'][] = $a->id;
            $arr['order'] = rand($this->order_start, $this->order_end);
            $res[] = $arr;
        }
       
        usort($res, function($a, $b){
            return $a['order'] > $b['order'];
        });
        
        return $res;
    }


}
