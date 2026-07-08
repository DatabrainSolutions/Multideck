using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CusQuoteHeader
{
    public Guid CusQuoteHeaderId { get; set; }

    public Guid? OrgId { get; set; }

    public Guid? OrgOfficeId { get; set; }

    public int? CusQuoteHeaderType { get; set; }

    public int CusQuoteHeaderNumber { get; set; }

    public int CusQuoteHeaderNextRev { get; set; }

    public Guid CusQuoteHeaderCustomerId { get; set; }

    public Guid? CusQuoteHeaderCustomerContact { get; set; }

    public DateTime? CusQuoteHeaderDeadline { get; set; }

    public int? CusQuoteHeaderStatus { get; set; }

    public DateTime CusQuoteHeaderCreatedDate { get; set; }

    public Guid CusQuoteHeaderCreatedBy { get; set; }

    public Guid? CusQuoteHeaderLastEditedBy { get; set; }

    public DateTime? CusQuoteHeaderLastEditedDate { get; set; }

    public Guid? CusQuoteHeaderJobId { get; set; }

    public Guid? CusQuoteHeaderOrgOfficeId { get; set; }

    public string? CusQuoteHeaderInternalNotes { get; set; }

    public bool CusQuoteHeaderIsDeleted { get; set; }

    public Guid? CusQuoteHeaderLegalEntityId { get; set; }

    public Guid? CusQuoteHeaderBrandId { get; set; }

    public string? CusQuoteHeaderLegalEntityNameSnapshot { get; set; }

    public string? CusQuoteHeaderBrandNameSnapshot { get; set; }

    public virtual ICollection<CrmLeadConversion> CrmLeadConversions { get; set; } = new List<CrmLeadConversion>();

    public virtual ICollection<CrmOpportunityQuoteLink> CrmOpportunityQuoteLinks { get; set; } = new List<CrmOpportunityQuoteLink>();

    public virtual ICollection<CrmQuoteFollowup> CrmQuoteFollowups { get; set; } = new List<CrmQuoteFollowup>();

    public virtual CmpBrand? CusQuoteHeaderBrand { get; set; }

    public virtual JobHeader? CusQuoteHeaderJob { get; set; }

    public virtual CmpLegalEntity? CusQuoteHeaderLegalEntity { get; set; }

    public virtual CmpOffice? CusQuoteHeaderOrgOffice { get; set; }

    public virtual ICollection<CusQuoteRevision> CusQuoteRevisions { get; set; } = new List<CusQuoteRevision>();

    public virtual ICollection<EdiMessage> EdiMessages { get; set; } = new List<EdiMessage>();
}
