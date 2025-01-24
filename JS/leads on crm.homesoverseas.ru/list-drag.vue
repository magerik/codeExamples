<!--
crm.homesoverseas.ru (Vue 2)

Отображение страницы сделок 

Display leads page in CRM
Demo: https://crm.erikhgailis.ru/#/leads/list-drag
-->

<template>
  <div class="app-container list-drag">
    <router-link :to="'/leads/list'+link_plus" class="link-type">
      <el-button class="filter-item" type="primary">
        <svg-icon icon-class="list" /> список
      </el-button>
    </router-link>

    <router-link :to="'/leads/new/'" class="link-type mrg10L">
      <el-button class="filter-item" href="" type="primary" icon="el-icon-plus">
        добавить сделку
      </el-button>
    </router-link>

    <el-button class="filter-item mrg10L" href="" type="primary" icon="el-icon-edit" @click="dialogVisible = true">
      Воронка
    </el-button>

    <el-button class="filter-item mrg10L" href="" type="primary" icon="el-icon-refresh" @click="getList()" />

    <div class="clear" />
    <div ref="fline" class="fline fwidth" @click.self="showFilters = !showFilters">
      <div class="fcaret" @click.stop="showFilters = !showFilters">
        <i v-show="showFilters" class="el-icon-caret-top" />
        <i v-show="!showFilters" class="el-icon-caret-bottom" />
      </div>
      <input v-model="listQuery.search" class="finput" :style="'width:'+(listQuery.search.length>15?listQuery.search.length:15)+'ch'" placeholder="Поиск и фильтры" @keyup.enter.native="getList" @click.self="showFilters = true">
      <template v-for="(mid, index) in listQuery.managerid">
        <el-tag v-show="mid!=my_id || listQuery.managerid.length>1" :key="mid" closable @close="removeMid(index)">{{ $utils.getKeyByValue(managersListAndAll, mid) }}</el-tag>
      </template>

      <el-tag v-show="listQuery.funnel_status>0" closable @close="listQuery.funnel_status=0">{{ funnel_statuses_all[listQuery.funnel_status] }}</el-tag>
      <el-tag v-show="listQuery.lead_type>0" closable @close="listQuery.lead_type=0">{{ leads_types[listQuery.lead_type] }}</el-tag>

      <template v-for="(mid, index) in listQuery.adv_type">
        <el-tag :key="'adv'+mid" closable @close="listQuery.adv_type.splice(index,1)">{{ adv_types[mid] }}</el-tag>
      </template>

      <el-tag v-show="listQuery.company_id>0" closable @close="listQuery.company_id=0;listQuery.company_name=''">компания: {{ listQuery.company_name }}</el-tag>
      <template
        v-for="(value, key) in {
          created_date: 'создания',
          closing_date_plan: 'ожидания закрытия',
          next_task_date: 'след. действия',
        }"
      >
        <el-tag v-show="listQuery[key+'_from']" :key="key+'_from'" closable @close="listQuery[key+'_from']=''">дата {{ value }} от: {{ listQuery[key+'_from'] }}</el-tag>
        <el-tag v-show="listQuery[key+'_to']" :key="key+'_to'" closable @close="listQuery[key+'_to']=''">дата {{ value }} до: {{ listQuery[key+'_to'] }}</el-tag>
      </template>
      <div class="clear" />
    </div>

    <div class="relative">
      <div v-show="showFilters" v-closable="{exclude: ['fline'], handler: 'closeFilters'}" class="fwindow fwidth">

        <el-select
          v-model="listQuery.company_name"
          filterable
          remote
          reserve-keyword
          placeholder="поиск компании"
          :remote-method="companySearch"
          class="filter-item"
          @change="companySelect"
        >
          <el-option label="Все компании" :value="0" />
          <el-option v-for="item in companies_list" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>

        <el-select v-model="listQuery.managerid" multiple reserve-keyword collapse-tags placeholder="Мои сделки" class="filter-item">
          <el-option v-show="listQuery.managerid && listQuery.managerid != my_id" :key="my_id" label="Мои сделки" :value="my_id" />
          <!-- Исключаем текущего менеджера из списка -->
          <!-- <el-option v-for="(name,index) in $utils.excludeFromObjectArr(managersListAndAll, [my_id])" :key="index" :label="name" :value="index" /> -->
          <el-option v-for="name in Object.keys(managersListAndAll).filter(name => managersListAndAll[name] !== my_id)" :key="name" :label="name" :value="managersListAndAll[name]" :class="'opt_mng'+managersListAndAll[name]" />
        </el-select>

        <el-select v-model="listQuery.lead_type" placeholder="Все типы сделок" class="filter-item">
          <el-option label="Все типы сделок" :value="0" />
          <el-option v-for="(item,index) in leads_types" :key="index" :label="item" :value="+index" />
        </el-select>

        <el-select v-model="listQuery.adv_type" multiple placeholder="Все виды рекламы" class="filter-item"> 
          <el-option v-for="(item,index) in adv_types" :key="index" :label="item" :value="+index" />
        </el-select>

       

        <template
          v-for="(value, key) in {
            created_date: 'создания',
            closing_date_plan: 'ожидания закрытия',
            next_task_date: 'след. действия',
          }"
        > <el-date-picker
          :key="key+'_from'"
          v-model="listQuery[key+'_from']"
          type="date"
          format="yyyy-MM-dd"
          value-format="yyyy-MM-dd"
          :placeholder="'Дата '+value+' от'"
          class="filter-item"
          :picker-options="$utils.pickerOptions"
        /> <el-date-picker
          :key="key+'_to'"
          v-model="listQuery[key+'_to']"
          type="date"
          format="yyyy-MM-dd"
          value-format="yyyy-MM-dd"
          :placeholder="'Дата '+value+' до'"
          class="filter-item"
          :picker-options="$utils.pickerOptions"
        /> </template>

      </div>
    </div>

    <div class="clear" /> <!-- ======================================== ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ ==================== -->

    <div class="components-container board dragscroll" style="overflow-x: scroll; width:auto;" :class="{loading}"><!--   v-dragscroll style="overflow-x: hidden;"--><!--  v-dragscroll.pass.x style="overflow-x: hidden;" -->
      <Kanban v-for="(list, name) in lists" :key="name" :list="list" :group="group" :data-colid="getIdByName(name)" class="kanbano" :header-text="name" :managers="managersList" :listQuery="listQuery" />
    </div>

    <el-dialog
      :visible.sync="dialogVisible"
      width="30%"
    >
      <LeadsSettings :reload="dialogVisible" @onsave="settings_save" />
    </el-dialog>

  </div>
</template>
<script>
import Kanban from './components/Kanban'
import request from '@/utils/request'
import LeadsSettings from './components/LeadsSettings'
import { dragScrollGo } from '@/utils/drag-scroll.js'

export default {
  name: 'LeadListDrag',
  components: {
    Kanban,
    LeadsSettings
  },
  /* directives: {
      'dragscroll': dragscroll
    },*/
  /* props: {
    funnel_id: 0
  },*/
  data() {
    return {
      group: 'any_string',
      lists: {},
      old_lists: {},
      funnel_id: 0,
      loading: false,
      dialogVisible: false,
      showFilters: false,
      listQuery: this.get_listQuery(),
      managersList: [],
      managersListAndAll: [],
      leads_types: [],
      adv_types: [],
      languages: [],
      funnel_statuses_all: [],
      companies_list: [],
      my_id: this.$store.getters.userid,
      link_plus: this.$store.getters.userid === '2' ? '?managerid=0' : ''
    }
  },

  watch: {
    listQuery: {
      deep: true,
      handler(newVal, oldVal) {
        this.$router.push({ query: this.$utils.deepCloneClear(this.listQuery) })
        console.log('listQuery watch')
        this.getList()
      }
    },

    $route(newVal, oldVal) {
      if (newVal.name === this.routeName) {
        this.refresh_listQuery()
      }
    }
  },

  beforeCreate() {

  },

  created() {
    this.routeName = this.$route.name
    this.$utils.loadSelects(['managersList', 'managersListAndAll', 'leads_types', 'adv_types', 'languages', 'funnel_statuses_all'], this)
    this.getList()

    window.listDrag = this
  },
  mounted() {
    this.$nextTick(() => {
      dragScrollGo('dragscroll', 'div')
    })
  },

  updated() {
    this.auto_height()
  },

  methods: {
    get_listQuery() {
      let managerid = []
      if (this.$route.query.managerid) {
        if (Array.isArray(this.$route.query.managerid)) managerid = this.$route.query.managerid
        else managerid = [this.$route.query.managerid]
      }

      return {
        search: this.$route.query.search || '',
        company_id: this.$route.query.company_id || 0,
        company_name: this.$route.query.company_name || '',
        managerid: managerid,
        funnel_status: this.$route.query.funnel_status || '',
        lead_type: this.$route.query.lead_type || '',
        adv_type: this.$route.query.adv_type || [],
        created_date_from: this.$route.query.created_date_from || '',
        created_date_to: this.$route.query.created_date_to || '',
        closing_date_plan_from: this.$route.query.closing_date_plan_from || '',
        closing_date_plan_to: this.$route.query.closing_date_plan_to || '',
        next_task_date_from: this.$route.query.next_task_date_from || '',
        next_task_date_to: this.$route.query.next_task_date_to || ''
      }
    },

    refresh_listQuery() {
      if (JSON.stringify(this.$utils.deepCloneClear(this.listQuery)) !== JSON.stringify(this.$utils.deepCloneClear(this.get_listQuery()))) {
        this.listQuery = this.get_listQuery()
      }
    },

    settings_save() {
      this.getList()
      this.dialogVisible = false
    },

    getIdByName(name) {
      return Object.keys(this.funnel_statuses_all).find(id => this.funnel_statuses_all[id].name === name)
    },

    change_funnel_id(val) {
      if (this.funnel_id === val) return
      this.funnel_id = val
      this.$router.push(`${this.$route.path}?funnel_id=` + val)
      this.getList()
    },

    getList() {
      if (this.$route.query.funnel_id) this.funnel_id = this.$route.query.funnel_id
      if (!this.funnel_id) this.funnel_id = 1
      this.loading = true
      request({
        url: '/leads/list-drag.php', // ?funnel_id=' + this.funnel_id,
        method: 'get',
        params: this.$utils.deepCloneClear(this.listQuery)
      }).then(response => {
        // console.log(response)
        this.lists = response.data.leads
        this.statuses = response.data.statuses
        this.managers = response.data.managers
        // this.auto_height()
        this.loading = false
      })
    },

    auto_height() {
      // return // вырубаем, мешает
      // const parentHeight = document.querySelector('.app-main .board').clientHeight + 'px'
      document.querySelectorAll('.board .kanbano .board-column-content').forEach(el => {
        el.style.height = 'auto'
      })
      let maxH = 0
      document.querySelectorAll('.board .kanbano .board-column-content').forEach(el => {
        if (el.offsetHeight > maxH) maxH = el.offsetHeight
      })
      document.querySelectorAll('.board .kanbano .board-column-content').forEach(el => {
        el.style.height = maxH + 'px'
      })
    },

    companySearch(query) {
      if (query === '' || query.length < 2) return
      request({
        url: '/selects/companies_search.php',
        method: 'get',
        params: {
          query
        }
      })
        .then((response) => {
          this.companies_list = response.data
        }).catch(function(error) {
          console.log(error)
        })
    },

    companySelect(x) {
      this.listQuery.company_id = x
      this.listQuery.company_name = this.companies_list.find(c => { return c.id === x }).name
      // console.log($event)
    },

    closeFilters() {
      this.showFilters = false
    },

    removeMid(index) {
      // на прямую не срабатывает реактивность  = this.listQuery.managerid.splice(index, 1)
      // this.$delete(this.listQuery.managerid, index)
      const arr = this.listQuery.managerid.slice()
      arr.splice(index, 1)
      this.listQuery.managerid = arr
    }

  }
}
</script>

<!-- lang="scss"-->
<style>

/*.leads-list-drag .app-main{overflow:visible;}*/

.list-drag{background-color: #f0f2f5;}
.list-drag .fwindow, .list-drag .finput{background-color: #f0f2f5;}

.board {
  width: 100%;
  margin-left: 0;
  margin-top:15px;
  margin-right:0;
  display: flex;
  /*justify-content: space-around;*/
  flex-direction: row;
  align-items: flex-start;
  /*overflow-x:scroll;*/
  cursor:grab;
  padding-bottom: 5px;
}

.board:auto_height{cursor:grabbing;}

.lead-tab-wrap{margin:0;overflow:hidden;}

.lead-tab-wrap .lead-tab{float:left;margin-right:10px;cursor:pointer;}

.lead-tab-wrap .active{font-weight:bold;cursor:default;}

.kanban {
  &.todo {
    .board-column-header {
      background: #4A9FF9;
    }
  }
  &.working {
    .board-column-header {
      background: #f9944a;
    }
  }
  &.done {
    .board-column-header {
      background: #2ac06d;
      background: #2ac06d;
    }
  }
}

</style>

