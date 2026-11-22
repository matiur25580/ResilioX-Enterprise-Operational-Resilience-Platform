import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';

export const continuityRouter = Router();
continuityRouter.use(requireAuth);

const planStatuses = ['DRAFT','IN_REVIEW','APPROVED','RETIRED'] as const;
const exerciseTypes = ['TABLETOP','WALKTHROUGH','SIMULATION','FULL_SCALE'] as const;
const exerciseStatuses = ['PLANNED','IN_PROGRESS','COMPLETED','CANCELLED'] as const;
const exerciseResults = ['SUCCESS','PARTIAL_FAILURE','FAILURE'] as const;
const actionStatuses = ['OPEN','IN_PROGRESS','BLOCKED','COMPLETED'] as const;
const actionSeverities = ['LOW','MEDIUM','HIGH','CRITICAL'] as const;
const approvers = ['OWNER','ADMIN','RESILIENCE_MANAGER'];

const planInclude = {
  service: { select: { id: true, name: true, criticality: true, ownerName: true } },
  exercises: { include: { actions: { orderBy: { dueAt: 'asc' as const } } }, orderBy: { scheduledAt: 'asc' as const } },
};

continuityRouter.get('/summary', async (req,res) => {
  const organizationId=req.auth!.organizationId;
  const [plans, exercises, actions] = await Promise.all([
    prisma.continuityPlan.findMany({where:{organizationId,status:{not:'RETIRED'}},select:{status:true,reviewDueAt:true}}),
    prisma.continuityExercise.findMany({where:{plan:{organizationId}},select:{status:true,result:true,scheduledAt:true}}),
    prisma.continuityAction.findMany({where:{exercise:{plan:{organizationId}}},select:{status:true,dueAt:true,severity:true}})
  ]);
  const now=new Date();
  res.json({data:{
    totalPlans:plans.length, approvedPlans:plans.filter(p=>p.status==='APPROVED').length,
    reviewOverdue:plans.filter(p=>p.reviewDueAt && p.reviewDueAt<now).length,
    upcomingExercises:exercises.filter(e=>e.status==='PLANNED' && e.scheduledAt>=now).length,
    failedExercises:exercises.filter(e=>e.result==='FAILURE'||e.result==='PARTIAL_FAILURE').length,
    openActions:actions.filter(a=>a.status!=='COMPLETED').length,
    overdueActions:actions.filter(a=>a.status!=='COMPLETED'&&a.dueAt<now).length,
  }});
});

continuityRouter.get('/services',async(req,res)=>{
 const services=await prisma.businessService.findMany({where:{organizationId:req.auth!.organizationId,status:{not:'RETIRED'}},select:{id:true,name:true,criticality:true,ownerName:true},orderBy:{name:'asc'}});
 res.json({data:services});
});
continuityRouter.get('/',async(req,res)=>{
 const plans=await prisma.continuityPlan.findMany({where:{organizationId:req.auth!.organizationId,status:{not:'RETIRED'}},include:planInclude,orderBy:[{updatedAt:'desc'}],take:200});
 res.json({data:plans});
});
continuityRouter.post('/',requirePermission('continuity:write'),async(req,res)=>{
 const input=z.object({
  serviceId:z.string().uuid(),title:z.string().trim().min(3).max(180),ownerName:z.string().trim().min(2).max(120),
  scope:z.string().trim().min(20).max(10000),activationCriteria:z.string().trim().min(10).max(5000),
  recoveryStrategy:z.string().trim().min(20).max(10000),recoveryProcedures:z.string().trim().min(20).max(15000),
  communicationsPlan:z.string().trim().min(20).max(10000),rtoMinutes:z.number().int().positive().max(525600),
  rpoMinutes:z.number().int().min(0).max(525600),reviewDueAt:z.string().datetime().optional()
 }).parse(req.body);
 const organizationId=req.auth!.organizationId;
 const service=await prisma.businessService.findFirst({where:{id:input.serviceId,organizationId},select:{id:true}});
 if(!service)throw new AppError(404,'CONTINUITY_SERVICE_NOT_FOUND','The selected service does not exist in this workspace.');
 const latest=await prisma.continuityPlan.findFirst({where:{organizationId,serviceId:input.serviceId},orderBy:{version:'desc'},select:{version:true}});
 const created=await prisma.$transaction(async tx=>{
  const plan=await tx.continuityPlan.create({data:{...input,organizationId,version:(latest?.version??0)+1,reviewDueAt:input.reviewDueAt?new Date(input.reviewDueAt):null},include:planInclude});
  await tx.auditEvent.create({data:{organizationId,actorUserId:req.auth!.userId,action:'continuity.plan_created',targetType:'continuity_plan',targetId:plan.id,metadata:{serviceId:input.serviceId,version:plan.version}}});
  return plan;
 });
 res.status(201).json({data:created});
});
continuityRouter.post('/:planId/submit',requirePermission('continuity:write'),async(req,res)=>{
 const id=z.string().uuid().parse(req.params.planId), organizationId=req.auth!.organizationId;
 const current=await prisma.continuityPlan.findFirst({where:{id,organizationId},select:{id:true,status:true}});
 if(!current)throw new AppError(404,'CONTINUITY_PLAN_NOT_FOUND','The continuity plan was not found.');
 if(current.status!=='DRAFT')throw new AppError(409,'CONTINUITY_INVALID_TRANSITION','Only draft plans can be submitted.');
 const updated=await prisma.$transaction(async tx=>{
  const p=await tx.continuityPlan.update({where:{id},data:{status:'IN_REVIEW',submittedAt:new Date(),submittedBy:req.auth!.userId},include:planInclude});
  await tx.auditEvent.create({data:{organizationId,actorUserId:req.auth!.userId,action:'continuity.plan_submitted',targetType:'continuity_plan',targetId:id}});
  return p;
 });
 res.json({data:updated});
});
continuityRouter.post('/:planId/approve',requirePermission('continuity:write'),async(req,res)=>{
 const id=z.string().uuid().parse(req.params.planId), organizationId=req.auth!.organizationId;
 if(!approvers.some(role=>role===req.auth!.role))throw new AppError(403,'CONTINUITY_APPROVAL_FORBIDDEN','Only workspace owners, administrators and resilience managers can approve plans.');
 const current=await prisma.continuityPlan.findFirst({where:{id,organizationId},select:{id:true,status:true,submittedBy:true}});
 if(!current)throw new AppError(404,'CONTINUITY_PLAN_NOT_FOUND','The continuity plan was not found.');
 if(current.status!=='IN_REVIEW')throw new AppError(409,'CONTINUITY_INVALID_TRANSITION','Only plans in review can be approved.');
 if(current.submittedBy===req.auth!.userId)throw new AppError(403,'CONTINUITY_MAKER_CHECKER_REQUIRED','The plan submitter cannot approve their own plan. A different authorized reviewer must approve it.');
 const updated=await prisma.$transaction(async tx=>{
  const p=await tx.continuityPlan.update({where:{id},data:{status:'APPROVED',approvedAt:new Date(),approvedBy:req.auth!.userId},include:planInclude});
  await tx.auditEvent.create({data:{organizationId,actorUserId:req.auth!.userId,action:'continuity.plan_approved',targetType:'continuity_plan',targetId:id}});
  return p;
 });
 res.json({data:updated});
});
continuityRouter.post('/:planId/retire',requirePermission('continuity:write'),async(req,res)=>{
 const id=z.string().uuid().parse(req.params.planId), organizationId=req.auth!.organizationId;
 if(!approvers.includes(req.auth!.role))throw new AppError(403,'CONTINUITY_RETIRE_FORBIDDEN','Only workspace owners, administrators and resilience managers can retire plans.');
 const current=await prisma.continuityPlan.findFirst({where:{id,organizationId},select:{id:true,status:true}});
 if(!current)throw new AppError(404,'CONTINUITY_PLAN_NOT_FOUND','The continuity plan was not found.');
 if(current.status!=='APPROVED')throw new AppError(409,'CONTINUITY_INVALID_TRANSITION','Only approved plans can be retired.');
 const p=await prisma.$transaction(async tx=>{
  const updated=await tx.continuityPlan.update({where:{id},data:{status:'RETIRED'},include:planInclude});
  await tx.auditEvent.create({data:{organizationId,actorUserId:req.auth!.userId,action:'continuity.plan_retired',targetType:'continuity_plan',targetId:id}});
  return updated;
 });
 res.json({data:p});
});
continuityRouter.post('/:planId/exercises',requirePermission('continuity:write'),async(req,res)=>{
 const planId=z.string().uuid().parse(req.params.planId),organizationId=req.auth!.organizationId;
 const input=z.object({exerciseType:z.enum(exerciseTypes),title:z.string().trim().min(3).max(180),scenario:z.string().trim().min(20).max(10000),objectives:z.string().trim().min(10).max(5000),scheduledAt:z.string().datetime()}).parse(req.body);
 const plan=await prisma.continuityPlan.findFirst({where:{id:planId,organizationId,status:'APPROVED'},select:{id:true}});
 if(!plan)throw new AppError(404,'APPROVED_CONTINUITY_PLAN_NOT_FOUND','An approved plan in this workspace is required to schedule an exercise.');
 const exercise=await prisma.$transaction(async tx=>{
  const e=await tx.continuityExercise.create({data:{...input,planId,scheduledAt:new Date(input.scheduledAt)}});
  await tx.auditEvent.create({data:{organizationId,actorUserId:req.auth!.userId,action:'continuity.exercise_scheduled',targetType:'continuity_exercise',targetId:e.id,metadata:{planId,exerciseType:input.exerciseType}}});
  return e;
 });
 res.status(201).json({data:exercise});
});
continuityRouter.patch('/exercises/:exerciseId/status',requirePermission('continuity:write'),async(req,res)=>{
 const id=z.string().uuid().parse(req.params.exerciseId),organizationId=req.auth!.organizationId;
 const input=z.object({status:z.enum(exerciseStatuses),result:z.enum(exerciseResults).optional(),findings:z.string().trim().min(10).max(10000).optional()}).parse(req.body);
 if(input.status==='COMPLETED'&&(!input.result||!input.findings))throw new AppError(400,'EXERCISE_OUTCOME_REQUIRED','A completed exercise requires an outcome and findings summary.');
 const current=await prisma.continuityExercise.findFirst({where:{id,plan:{organizationId}},select:{id:true,status:true}});
 if(!current)throw new AppError(404,'CONTINUITY_EXERCISE_NOT_FOUND','The exercise was not found.');
 if(current.status==='COMPLETED'||current.status==='CANCELLED')throw new AppError(409,'CONTINUITY_EXERCISE_TERMINAL','Completed and cancelled exercises cannot be changed.');
 const allowed=current.status==='PLANNED'?['IN_PROGRESS','CANCELLED']:['COMPLETED','CANCELLED'];
 if(!allowed.some(status=>status===input.status))throw new AppError(409,'CONTINUITY_EXERCISE_INVALID_TRANSITION','Planned exercises must start or be cancelled; in-progress exercises must be completed or cancelled.');
 const updated=await prisma.$transaction(async tx=>{
  const e=await tx.continuityExercise.update({where:{id},data:{status:input.status,...(input.result?{result:input.result}:{}),...(input.findings?{findings:input.findings}:{}),completedAt:input.status==='COMPLETED'?new Date():null}});
  await tx.auditEvent.create({data:{organizationId,actorUserId:req.auth!.userId,action:'continuity.exercise_status_changed',targetType:'continuity_exercise',targetId:id,metadata:{from:current.status,to:input.status,result:input.result??null}}});
  return e;
 });
 res.json({data:updated});
});
continuityRouter.post('/exercises/:exerciseId/actions',requirePermission('continuity:write'),async(req,res)=>{
 const exerciseId=z.string().uuid().parse(req.params.exerciseId),organizationId=req.auth!.organizationId;
 const input=z.object({title:z.string().trim().min(3).max(180),ownerName:z.string().trim().min(2).max(120),severity:z.enum(actionSeverities),dueAt:z.string().datetime(),notes:z.string().max(5000).optional()}).parse(req.body);
 const exercise=await prisma.continuityExercise.findFirst({where:{id:exerciseId,plan:{organizationId}},select:{id:true}});
 if(!exercise)throw new AppError(404,'CONTINUITY_EXERCISE_NOT_FOUND','The exercise was not found.');
 const action=await prisma.$transaction(async tx=>{
  const a=await tx.continuityAction.create({data:{...input,exerciseId,dueAt:new Date(input.dueAt)}});
  await tx.auditEvent.create({data:{organizationId,actorUserId:req.auth!.userId,action:'continuity.action_created',targetType:'continuity_action',targetId:a.id}});
  return a;
 });
 res.status(201).json({data:action});
});
continuityRouter.patch('/actions/:actionId',requirePermission('continuity:write'),async(req,res)=>{
 const id=z.string().uuid().parse(req.params.actionId),organizationId=req.auth!.organizationId;
 const input=z.object({status:z.enum(actionStatuses),notes:z.string().max(5000).optional()}).parse(req.body);
 const current=await prisma.continuityAction.findFirst({where:{id,exercise:{plan:{organizationId}}},select:{id:true,status:true}});
 if(!current)throw new AppError(404,'CONTINUITY_ACTION_NOT_FOUND','The remediation action was not found.');
 const action=await prisma.$transaction(async tx=>{
  const a=await tx.continuityAction.update({where:{id},data:{status:input.status,...(input.notes!==undefined?{notes:input.notes}:{}),completedAt:input.status==='COMPLETED'?new Date():null}});
  await tx.auditEvent.create({data:{organizationId,actorUserId:req.auth!.userId,action:'continuity.action_updated',targetType:'continuity_action',targetId:id,metadata:{from:current.status,to:input.status}}});
  return a;
 });
 res.json({data:action});
});
