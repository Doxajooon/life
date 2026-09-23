/* Life Control V56 CLEAN — single source of truth for financial calculations */
const FinanceEngine={
  totalIncome(){return (state.profits||[]).reduce((a,x)=>a+Math.max(0,Number(x.amount)||0),0)},
  totalExpense(){return (state.expenses||[]).reduce((a,x)=>a+Math.max(0,Number(x.amount)||0),0)},
  wallet(){
    const opening=Math.max(0,Number(state.wallet?.openingBalance)||0);
    const historicalGoal=Math.max(0,Number(state.goal?.finance?.manualSavedAmount)||0);
    const income=this.totalIncome(),expense=this.totalExpense();
    const capital=opening+historicalGoal+income-expense;
    const goal=Math.max(0,Number(state.goal?.finance?.savedAmount)||0);
    const cash=capital-goal;
    return {opening,historicalGoal,income,expense,capital,goal,cash};
  },
  day(dateKey){
    const key=dateKey||keyDay();
    return {income:daySum(state.profits,key),expense:daySum(state.expenses,key),net:daySum(state.profits,key)-daySum(state.expenses,key)};
  },
  month(){
    const income=monthSum(state.profits),expense=monthSum(state.expenses);
    return {income,expense,net:income-expense};
  },
  goal(){
    if(typeof syncGoalFinanceCompletion==='function')syncGoalFinanceCompletion();
    const f=state.goal?.finance||{},target=Math.max(0,Number(f.targetAmount)||0),saved=Math.max(0,Number(f.savedAmount)||0);
    const cash=Math.max(0,this.wallet().capital-saved);
    const available=Math.max(0,saved+cash);
    const remaining=Math.max(0,target-available);
    const pct=target?clamp(Math.round(available/target*100),0,100):0;
    let days=0,daysLabel='Накопление',startText='—';
    const start=f.startedAt?new Date(f.startedAt):null;
    if(start&&!Number.isNaN(start.getTime())){
      startText=start.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'});
      const end=(f.completedAt&&target&&available>=target)?new Date(f.completedAt):new Date();
      days=Math.max(1,Math.ceil(Math.max(0,end.getTime()-start.getTime())/DAY_MS));
    }
    const completed=!!(target>0&&available>=target);
    if(completed)daysLabel='Собрано за';
    return {target,saved,cash,available,remaining,pct,days,daysLabel,startText,completed,targetDate:f.targetDate||''};
  }};
