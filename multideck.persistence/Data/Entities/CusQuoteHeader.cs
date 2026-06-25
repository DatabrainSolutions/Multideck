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

    public virtual ICollection<CusQuoteRevision> CusQuoteRevisions { get; set; } = new List<CusQuoteRevision>();
}
