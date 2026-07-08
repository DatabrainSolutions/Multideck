using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmSurveyQueue
{
    public Guid? ClmsurveyId { get; set; }

    public Guid? ClmsurveyIncidentId { get; set; }

    public string? ClmincidentNumber { get; set; }

    public Guid? ClmsurveyClaimId { get; set; }

    public string? ClmclaimNumber { get; set; }

    public Guid? ClmsurveySurveyorOrgId { get; set; }

    public string? ClmsurveySurveyorName { get; set; }

    public string? ClmsurveyStatusCode { get; set; }

    public string? ClmsurveyStatusName { get; set; }

    public string? ClmsurveyLocationName { get; set; }

    public DateTime? ClmsurveyRequestedAt { get; set; }

    public DateTime? ClmsurveyAppointmentAt { get; set; }

    public DateTime? ClmsurveyReportDueAt { get; set; }

    public DateTime? ClmsurveyReportReceivedAt { get; set; }

    public decimal? ClmsurveyCostAmount { get; set; }

    public string? ClmsurveyCurrencyCodeSnapshot { get; set; }

    public Guid? ClmsurveyWorkflowTaskId { get; set; }
}
