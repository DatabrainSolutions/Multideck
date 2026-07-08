using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmLeadConversion
{
    public Guid CrmleadConvId { get; set; }

    public Guid CrmleadConvLeadId { get; set; }

    public Guid CrmleadConvOrgId { get; set; }

    public Guid? CrmleadConvAccountId { get; set; }

    public Guid? CrmleadConvOpportunityId { get; set; }

    public Guid? CrmleadConvQuoteHeaderId { get; set; }

    public DateTime CrmleadConvConvertedAt { get; set; }

    public Guid? CrmleadConvConvertedBy { get; set; }

    public string? CrmleadConvConversionNotes { get; set; }

    public virtual CrmAccountProfile? CrmleadConvAccount { get; set; }

    public virtual CmpUser? CrmleadConvConvertedByNavigation { get; set; }

    public virtual CrmLead CrmleadConvLead { get; set; } = null!;

    public virtual CrmOpportunity? CrmleadConvOpportunity { get; set; }

    public virtual OrgMaster CrmleadConvOrg { get; set; } = null!;

    public virtual CusQuoteHeader? CrmleadConvQuoteHeader { get; set; }
}
