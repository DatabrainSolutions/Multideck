using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CdsImportDetail
{
    public Guid CdsimId { get; set; }

    public Guid CdsimCdsid { get; set; }

    public string? CdsimEntryType { get; set; }

    public string? CdsimArrivalTransportReference { get; set; }

    public string? CdsimPortOfArrivalCode { get; set; }

    public string? CdsimSupervisingCustomsOfficeCode { get; set; }

    public string? CdsimRequestedProcedureCode { get; set; }

    public string? CdsimPreviousProcedureCode { get; set; }

    public string CdsimAdditionalProcedureCodesJson { get; set; } = null!;

    public string? CdsimValuationMethod { get; set; }

    public string? CdsimMethodOfPaymentCode { get; set; }

    public string? CdsimDefermentAccountNumber { get; set; }

    public bool CdsimPostponedVataccounting { get; set; }

    public bool CdsimDutyDefermentRequested { get; set; }

    public string CdsimImportSpecificJson { get; set; } = null!;

    public DateTime CdsimCreatedAt { get; set; }

    public virtual CdsDeclaration CdsimCds { get; set; } = null!;
}
