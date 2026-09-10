type Value=Record<string,unknown>
/** Bind the proposed transfer to two authorised records and the current contact version. */
export function contactTransferReview(records: Map<string,Value>,args: Value) {
 const contact=records.get(String(args.contact_id??'')),target=records.get(String(args.target_organisation_id??''))
 if (!contact || contact.sourceTable!=='Org_Contacts' || !Number.isInteger(contact.editVersion) || contact.editVersion!==args.expected_version
  || typeof contact.name!=='string' || typeof contact.organisationName!=='string' || typeof contact.organisationId!=='string')
  throw new Error('Read the contact with its current company and edit version before preparing this move.')
 if (!target || target.sourceTable!=='Org_Master' || typeof target.name!=='string') throw new Error('Read the destination company before preparing this move.')
 if (contact.organisationId===args.target_organisation_id) throw new Error('This contact already belongs to that company.')
 if (typeof args.startedAt!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(args.startedAt) || !Number.isFinite(Date.parse(args.startedAt)) || new Date(args.startedAt).toISOString().slice(0,10)!==args.startedAt)
  throw new Error('Choose a valid effective date for the transfer.')
 const changes=[{field:'Company',before:contact.organisationName,after:target.name,value:target.name,beforeKnown:true,kind:'changed'},
  {field:'Effective date',before:null,after:args.startedAt,value:args.startedAt,beforeKnown:true,kind:'added'}]
 for (const [key,label] of [['jobTitle','Job title'],['department','Department'],['role','Relationship role']]) {
  if (!Object.hasOwn(contact,key)) throw new Error('Read all current contact details before preparing this move.')
  // The canonical writer preserves these fields for null/empty input.
  const after=typeof args[key]==='string' && args[key].trim()?args[key].trim():contact[key]
  if (after!==contact[key]) changes.push({field:label,before:contact[key] as string|null,after:after as string,value:after as string,beforeKnown:true,kind:'changed'})
 }
 return {title:`Move ${contact.name}`,description:`Move ${contact.name} from ${contact.organisationName} to ${target.name}. Existing employment history and contact details are retained.`,changes}
}
