using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinCreditNoteApproval
{
    public Guid FincnraId { get; set; }

    public Guid FincnraRequestId { get; set; }

    public Guid? FincnraAuthorisationRequestId { get; set; }

    public string FincnraDecisionCode { get; set; } = null!;

    public DateTime FincnraDecidedAt { get; set; }

    public Guid? FincnraDecidedBy { get; set; }

    public string? FincnraComments { get; set; }

    public virtual FinAuthorisationRequest? FincnraAuthorisationRequest { get; set; }

    public virtual CmpUser? FincnraDecidedByNavigation { get; set; }

    public virtual FinCreditNoteRequest FincnraRequest { get; set; } = null!;
}
