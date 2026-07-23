using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MigOpenValidationIssue
{
    public Guid? IssueId { get; set; }

    public Guid? BatchId { get; set; }

    public string? BatchCode { get; set; }

    public string? EntityTypeCode { get; set; }

    public Guid? RowId { get; set; }

    public int? RowNumber { get; set; }

    public string? SeverityCode { get; set; }

    public string? FieldName { get; set; }

    public string? IssueCode { get; set; }

    public string? Message { get; set; }

    public DateTime? CreatedAt { get; set; }
}
