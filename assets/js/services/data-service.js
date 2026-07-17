import { parseCsv, normalizeHeader } from "./csv-parser.js";

/** Camada central de leitura e compatibilidade dos dados administrativos. */
class DataService {
  constructor() { this.manifest=null; this.datasets=new Map(); this.status=new Map(); this.initialized=false; }

  async initialize() {
    this.reset();
    try {
      this.manifest=await fetchJson("data/manifest.json");
      await Promise.all(Object.entries(this.manifest.datasets??{}).map(([name,config])=>this.loadDataset(name,config)));
      this.validateUniqueIds(); this.validateRelationships(); this.initialized=true;
    } catch(error) {
      console.error("Falha ao inicializar a camada de dados.",error);
      this.status.set("manifest",{state:"error",count:0,errors:[error.message],warnings:[]});
    }
    return this.getHealthReport();
  }
  reset(){this.manifest=null;this.datasets.clear();this.status.clear();this.initialized=false;}

  async loadDataset(name,config){
    const report={state:"loading",count:0,errors:[],warnings:[],path:config.path}; this.status.set(name,report);
    try {
      const response=await fetch(config.path,{cache:"no-store"});
      if(!response.ok) throw new Error(`HTTP ${response.status} ao carregar ${config.path}`);
      const parsed=parseCsv(await response.text());
      const aliases=Object.fromEntries(Object.entries(config.columnAliases??{}).map(([from,to])=>[normalizeHeader(from),normalizeHeader(to)]));
      const headers=parsed.headers.map(header=>aliases[header]??header);
      const rows=parsed.rows.map(row=>applyAliases(row,aliases));
      const required=(config.requiredColumns??[]).map(normalizeHeader);
      const missing=required.filter(column=>!headers.includes(column));
      if(missing.length) report.errors.push(`Colunas obrigatórias ausentes: ${missing.join(", ")}.`);
      this.datasets.set(name,rows); report.count=rows.length; report.state=report.errors.length?"error":"ready";
    } catch(error){this.datasets.set(name,[]);report.state="error";report.errors.push(error.message);}
  }

  getAll(name,{activeOnly=false}={}){const rows=structuredClone(this.datasets.get(name)??[]);return activeOnly?rows.filter(row=>row.ativo!==false):rows;}
  getById(name,id){const config=this.manifest?.datasets?.[name];if(!config?.idColumn)return null;return this.getAll(name).find(row=>String(row[config.idColumn])===String(id))??null;}

  getResourcesForLevel(levelId){
    const resources=this.getAll("recursos",{activeOnly:true});
    const links=this.getAll("nivelRecursos").filter(link=>link.nivel_id===levelId).sort(sortByOrder);
    if(links.length) return links.map(link=>{const resource=resources.find(item=>item.recurso_id===link.recurso_id);return resource?{...resource,relacao_nivel:link}:null;}).filter(Boolean);
    return resources.filter(resource=>resource.nivel_id===levelId); // compatibilidade V1
  }

  getLevelForResource(resourceId){
    const link=this.getAll("nivelRecursos").find(item=>item.recurso_id===resourceId);
    const resource=this.getById("recursos",resourceId);
    return this.getById("niveis",link?.nivel_id||resource?.nivel_id||"");
  }

  getContentsForLevel(levelId){return sortByOrder(this.getAll("conteudosNiveis",{activeOnly:true}).filter(item=>item.nivel_id===levelId));}

  getHierarchy(){
    const categorias=sortByOrder(this.getAll("categorias",{activeOnly:true}));
    const dominios=sortByOrder(this.getAll("dominios",{activeOnly:true}));
    const competencias=sortByOrder(this.getAll("competencias",{activeOnly:true}));
    const niveis=sortByOrder(this.getAll("niveis",{activeOnly:true}));
    return categorias.map(categoria=>({...categoria,dominios:dominios.filter(d=>d.categoria_id===categoria.categoria_id).map(dominio=>({...dominio,competencias:competencias.filter(c=>c.dominio_id===dominio.dominio_id).map(competencia=>({...competencia,niveis:niveis.filter(n=>n.competencia_id===competencia.competencia_id).map(nivel=>({...nivel,conteudos:this.getContentsForLevel(nivel.nivel_id),recursos:this.getResourcesForLevel(nivel.nivel_id)}))}))}))}));
  }

  getHealthReport(){return{initialized:this.initialized,schemaVersion:this.manifest?.schemaVersion??null,dataVersion:this.manifest?.dataVersion??null,datasets:Object.fromEntries(this.status)};}
  validateUniqueIds(){for(const [name,config] of Object.entries(this.manifest?.datasets??{})){if(!config.idColumn)continue;const values=this.getAll(name).map(row=>row[config.idColumn]).filter(Boolean);const duplicates=values.filter((v,i)=>values.indexOf(v)!==i);if(duplicates.length){const r=this.status.get(name);r.errors.push(`IDs duplicados: ${[...new Set(duplicates)].join(", ")}.`);r.state="error";}}}
  validateRelationships(){
    const rules=[
      ["dominios","categoria_id","categorias","categoria_id"],["competencias","dominio_id","dominios","dominio_id"],
      ["niveis","competencia_id","competencias","competencia_id"],["conteudosNiveis","nivel_id","niveis","nivel_id"],
      ["nivelRecursos","nivel_id","niveis","nivel_id"],["nivelRecursos","recurso_id","recursos","recurso_id"],
      ["trilhaCompetencias","trilha_id","trilhas","trilha_id"],["trilhaCompetencias","competencia_id","competencias","competencia_id"],
      ["trilhaCompetencias","nivel_minimo_id","niveis","nivel_id"],["trilhaRecursos","trilha_id","trilhas","trilha_id"],
      ["trilhaRecursos","recurso_id","recursos","recurso_id"]
    ];
    for(const [childName,childColumn,parentName,parentColumn] of rules){const valid=new Set(this.getAll(parentName).map(row=>row[parentColumn]));const invalid=this.getAll(childName).map(row=>row[childColumn]).filter(value=>value&&!valid.has(value));if(invalid.length){const report=this.status.get(childName);report?.warnings.push(`Referências inexistentes em ${childColumn}: ${[...new Set(invalid)].join(", ")}.`);}}
  }
}
function applyAliases(row,aliases){const output={};for(const [key,value] of Object.entries(row)){output[aliases[key]??key]=value;}return output;}
function sortByOrder(rows){return[...rows].sort((a,b)=>Number(a.ordem||a.relacao_nivel?.ordem||0)-Number(b.ordem||b.relacao_nivel?.ordem||0)||String(a.nome||"").localeCompare(String(b.nome||""),"pt-BR"));}
async function fetchJson(path){const response=await fetch(path,{cache:"no-store"});if(!response.ok)throw new Error(`Não foi possível carregar ${path} (HTTP ${response.status}).`);return response.json();}
export const dataService=new DataService();
