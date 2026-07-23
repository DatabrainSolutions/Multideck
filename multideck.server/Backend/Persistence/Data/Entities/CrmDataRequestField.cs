using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmDataRequestField
{
    public Guid CrmdataReqFieldId { get; set; }

    public Guid CrmdataReqFieldRequestId { get; set; }

    public Guid CrmdataReqFieldFieldDefId { get; set; }

    public string CrmdataReqFieldTargetTable { get; set; } = null!;

    public string CrmdataReqFieldTargetPkcolumn { get; set; } = null!;

    public string CrmdataReqFieldTargetColumn { get; set; } = null!;

    public Guid CrmdataReqFieldTargetId { get; set; }

    public string CrmdataReqFieldQuestionText { get; set; } = null!;

    public bool CrmdataReqFieldIsRequired { get; set; }

    public string CrmdataReqFieldStatusCode { get; set; } = null!;

    public string? CrmdataReqFieldResponseValueText { get; set; }

    public string? CrmdataReqFieldResponseValueJson { get; set; }

    public Guid? CrmdataReqFieldFieldUpdateId { get; set; }

    public DateTime? CrmdataReqFieldReceivedAt { get; set; }

    public int CrmdataReqFieldSortOrder { get; set; }

    public virtual ICollection<CrmFieldUpdateQueue> CrmFieldUpdateQueues { get; set; } = new List<CrmFieldUpdateQueue>();

    public virtual CrmAutomationFieldDefinition CrmdataReqFieldFieldDef { get; set; } = null!;

    public virtual CrmFieldUpdateQueue? CrmdataReqFieldFieldUpdate { get; set; }

    public virtual CrmDataRequest CrmdataReqFieldRequest { get; set; } = null!;

    public virtual SysCrmdataRequestStatus CrmdataReqFieldStatusCodeNavigation { get; set; } = null!;
}
