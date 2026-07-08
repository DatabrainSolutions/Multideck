using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CdsPrintSummary
{
    public Guid? CdsId { get; set; }

    public Guid? CdsJobId { get; set; }

    public string? CdsDirection { get; set; }

    public string? CdsDeclarationKind { get; set; }

    public string? CdsDeclarationCategory { get; set; }

    public string? CdsStatus { get; set; }

    public string? CdsLrn { get; set; }

    public string? CdsMrn { get; set; }

    public string? CdsDucr { get; set; }

    public string? CdsMucr { get; set; }

    public Guid? CdsOrgOfficeId { get; set; }

    public string? CdsOfficeCodeSnapshot { get; set; }

    public string? CdsImporterNameSnapshot { get; set; }

    public string? CdsExporterNameSnapshot { get; set; }

    public int? CdsItemCount { get; set; }

    public decimal? CdsTotalGrossMass { get; set; }

    public decimal? CdsTotalStatisticalValue { get; set; }

    public string? CdsInvoiceCurrencyCodeSnapshot { get; set; }

    public string? CdsICustomsStatusSnapshot { get; set; }
}
