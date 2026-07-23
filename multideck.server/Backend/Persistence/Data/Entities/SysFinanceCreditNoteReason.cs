using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceCreditNoteReason
{
    public string FincnrCode { get; set; } = null!;

    public string FincnrName { get; set; } = null!;

    public string? FincnrDescription { get; set; }

    public int FincnrSortOrder { get; set; }

    public bool FincnrIsActive { get; set; }

    public virtual ICollection<FinCreditNoteLink> FinCreditNoteLinks { get; set; } = new List<FinCreditNoteLink>();

    public virtual ICollection<FinCreditNoteRequest> FinCreditNoteRequests { get; set; } = new List<FinCreditNoteRequest>();
}
